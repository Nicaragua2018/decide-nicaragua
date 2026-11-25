'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CHAT_INTERVALO_MS, CHAT_MAX, partirEnlaces, type ChatMensajeVista, type ChatPagina } from '@decide/shared';
import { avisarMensajeChat, borrarMensajeChat, enviarChat, leerChat } from '@/lib/actions';
import { fusionar, horaDe, reemplazarRecientes } from '@/lib/chat';
import { Guardian } from '@/components/guardian/Guardian';
import { ModerarForm } from '@/components/ModerarForm';
import { AppealForm } from '@/app/(app)/proposals/[id]/AppealForm';

/** Cada cuántas consultas se vuelve a pedir la página reciente entera (recoge ocultados y eliminados). */
const CADA_CUANTAS_COMPLETA = 6;
/** A cuántos píxeles del final se considera que la persona está leyendo lo último. */
const MARGEN_FINAL = 80;

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {partirEnlaces(texto).map((p, i) =>
        p.tipo === 'enlace' ? (
          <a key={i} href={p.valor} target="_blank" rel="noopener noreferrer nofollow">
            {p.valor}
          </a>
        ) : (
          <span key={i}>{p.valor}</span>
        ),
      )}
    </>
  );
}

function Mensaje({
  m,
  puedoModerar,
  alCambiar,
}: {
  m: ChatMensajeVista;
  puedoModerar: boolean;
  alCambiar: () => void;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (m.tipo === 'sistema') {
    return (
      <li className="chat-sistema">
        <span>{m.texto}</span>
      </li>
    );
  }

  const esGuardian = m.tipo === 'guardian';
  const visible = m.estado === 'visible';

  const eliminar = async () => {
    if (!window.confirm('¿Eliminar este mensaje? No se puede deshacer.')) return;
    setOcupado(true);
    const r = await borrarMensajeChat(m.id);
    setOcupado(false);
    if ('error' in r) setAviso(r.error);
    else alCambiar();
  };
  const avisar = async () => {
    setOcupado(true);
    const r = await avisarMensajeChat(m.id);
    setOcupado(false);
    setAviso('error' in r ? r.error : 'Aviso enviado. Lo verán la coordinación de la comunidad y la mesa directiva.');
  };

  return (
    <li className={`chat-msg${m.esMio ? ' chat-msg-mio' : ''}${esGuardian ? ' chat-msg-guardian' : ''}`}>
      <div className="chat-avatar" aria-hidden="true">
        {esGuardian ? <Guardian tamano={30} /> : (m.iniciales ?? '·')}
      </div>
      <div className="chat-burbuja">
        <p className="chat-cab">
          <span className="chat-autor">{esGuardian ? 'Guardián · asistente de IA' : m.autor}</span>
          {m.tipo === 'pregunta_guardian' && <span className="badge badge-asistente">Pregunta a Guardián</span>}
          <time className="chat-hora" dateTime={m.createdAt} suppressHydrationWarning>
            {horaDe(m.createdAt)}
          </time>
        </p>

        {visible && m.texto !== null && (
          <p className="chat-texto">
            <Texto texto={m.texto} />
          </p>
        )}
        {m.estado === 'eliminado' && <p className="chat-texto chat-texto-apagado">Mensaje eliminado por su autor.</p>}
        {m.estado === 'oculto' && <p className="chat-texto chat-texto-apagado">Mensaje oculto por moderación.</p>}

        {visible && m.enlaces.length > 0 && (
          <p className="chat-enlaces">
            {m.enlaces.map((e) => (
              <Link key={e.ruta + e.texto} href={e.ruta} className="btn btn-ghost btn-sm">
                {e.texto}
              </Link>
            ))}
          </p>
        )}

        {m.apelacionId && <AppealForm moderationId={m.apelacionId} />}

        {visible && (
          <div className="chat-acciones">
            {m.esMio && (
              <button type="button" className="comment-reply-btn" onClick={() => void eliminar()} disabled={ocupado}>
                Eliminar
              </button>
            )}
            {!m.esMio && !esGuardian && (
              <button type="button" className="comment-reply-btn" onClick={() => void avisar()} disabled={ocupado}>
                Avisar a la coordinación
              </button>
            )}
            {puedoModerar && m.avisos !== null && m.avisos > 0 && (
              <span className="badge badge-pending">{m.avisos === 1 ? '1 aviso' : `${m.avisos.toString()} avisos`}</span>
            )}
            {puedoModerar && <ModerarForm target="mensaje" targetId={m.id} colapsable className="form chat-moderar" />}
          </div>
        )}
        {aviso && (
          <p className="chat-nota" role="status">
            {aviso}
          </p>
        )}
      </div>
    </li>
  );
}

export default function SalaChat({ groupId, inicial }: { groupId: string; inicial: ChatPagina }) {
  const [mensajes, setMensajes] = useState<ChatMensajeVista[]>(inicial.mensajes);
  const [hayAnteriores, setHayAnteriores] = useState(inicial.hayAnteriores);
  const [puedoModerar, setPuedoModerar] = useState(inicial.puedoModerar);
  const [esperando, setEsperando] = useState(inicial.esperandoGuardian);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  /** La sala dejó de responder para esta persona (p. ej. ya no es miembro): se dice, no se calla. */
  const [cerrada, setCerrada] = useState<string | null>(null);

  const lista = useRef<HTMLOListElement>(null);
  const alFinal = useRef(true);
  const mensajesRef = useRef(mensajes);
  const vueltas = useRef(0);
  const consultando = useRef(false);
  /** Hubo un pedido de recarga mientras otra consulta estaba en camino: se hace al terminar. */
  const recargaPendiente = useRef(false);
  /** «Ver anteriores» ya llegó al principio de la sala. */
  const sinMasAnteriores = useRef(false);
  const fallos = useRef(0);
  mensajesRef.current = mensajes;

  const irAlFinal = useCallback(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Baja al final solo si la persona ya estaba leyendo lo último.
  useEffect(() => {
    if (alFinal.current) irAlFinal();
  }, [mensajes, esperando, irAlFinal]);

  const consultar = useCallback(
    async (completa: boolean) => {
      if (consultando.current) {
        if (completa) recargaPendiente.current = true;
        return;
      }
      consultando.current = true;
      try {
        const ultimo = mensajesRef.current[mensajesRef.current.length - 1];
        const entera = completa || !ultimo;
        const r = await leerChat(groupId, entera ? undefined : { despues: ultimo.id });
        if ('error' in r) {
          // Un fallo suelto (red) se deja pasar; si se repite, se avisa en vez de mostrar una sala congelada.
          fallos.current += 1;
          if (fallos.current >= 2) {
            setCerrada(r.error);
            setEsperando(false);
          }
          return;
        }
        fallos.current = 0;
        setCerrada(null);
        setMensajes((act) => (entera ? reemplazarRecientes(act, r.mensajes) : fusionar(act, r.mensajes)));
        if (entera && !sinMasAnteriores.current) setHayAnteriores((h) => h || r.hayAnteriores);
        setPuedoModerar(r.puedoModerar);
        setEsperando(r.esperandoGuardian);
      } finally {
        consultando.current = false;
        if (recargaPendiente.current) {
          recargaPendiente.current = false;
          void consultar(true);
        }
      }
    },
    [groupId],
  );

  // Consulta periódica, solo con la pestaña a la vista. Al volver a la vista, de inmediato.
  useEffect(() => {
    const tic = () => {
      if (document.visibilityState !== 'visible') return;
      vueltas.current += 1;
      void consultar(vueltas.current % CADA_CUANTAS_COMPLETA === 0);
    };
    const id = window.setInterval(tic, CHAT_INTERVALO_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') void consultar(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [consultar]);

  const enviar = async (llamarGuardian: boolean) => {
    const limpio = texto.trim();
    if (limpio.length === 0 || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await enviarChat(groupId, limpio, llamarGuardian);
    setEnviando(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setTexto('');
    alFinal.current = true;
    setMensajes((act) => fusionar(act, [r]));
    if (r.tipo === 'pregunta_guardian') setEsperando(true);
  };

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(false);
  };
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(false);
    }
  };

  const verAnteriores = async () => {
    const primero = mensajes[0];
    if (!primero || cargandoAnteriores) return;
    setCargandoAnteriores(true);
    const el = lista.current;
    const altoAntes = el?.scrollHeight ?? 0;
    const r = await leerChat(groupId, { antes: primero.id });
    setCargandoAnteriores(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    alFinal.current = false;
    setMensajes((act) => fusionar(r.mensajes, act));
    sinMasAnteriores.current = !r.hayAnteriores;
    setHayAnteriores(r.hayAnteriores);
    // Mantiene a la vista el mensaje que la persona estaba leyendo.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - altoAntes;
    });
  };

  const restantes = CHAT_MAX - texto.length;

  return (
    <section className="chat card" aria-label="Chat de la comunidad">
      <ol
        ref={lista}
        className="chat-lista"
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < MARGEN_FINAL;
        }}
      >
        {hayAnteriores && (
          <li className="chat-anteriores">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void verAnteriores()} disabled={cargandoAnteriores}>
              {cargandoAnteriores ? 'Cargando…' : 'Ver anteriores'}
            </button>
          </li>
        )}
        {mensajes.length === 0 && <li className="chat-vacio">Aún no hay mensajes. Escribe el primero.</li>}
        {mensajes.map((m) => (
          <Mensaje key={m.id} m={m} puedoModerar={puedoModerar} alCambiar={() => void consultar(true)} />
        ))}
        {esperando && (
          <li className="chat-sistema" role="status">
            <span>Guardián está escribiendo…</span>
          </li>
        )}
      </ol>

      <form className="chat-caja" onSubmit={alEnviar}>
        <label className="sr-only" htmlFor="chat-texto">
          Escribe un mensaje
        </label>
        <textarea
          id="chat-texto"
          className="form-textarea chat-entrada"
          rows={2}
          maxLength={CHAT_MAX}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          placeholder="Escribe un mensaje para tu comunidad"
        />
        <div className="chat-pie">
          <span className={`chat-contador${restantes < 100 ? ' chat-contador-poco' : ''}`} aria-live="off">
            {texto.length}/{CHAT_MAX}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm chat-btn-guardian"
            onClick={() => void enviar(true)}
            disabled={enviando || texto.trim().length === 0}
            title="Guardián solo recibe este mensaje, no el resto de la sala"
          >
            <Guardian tamano={18} /> Preguntar a Guardián
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={enviando || texto.trim().length === 0}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        {cerrada && (
          <p className="alert alert-warning" role="alert">
            El chat dejó de actualizarse: {cerrada}
          </p>
        )}
        <p className="chat-ayuda">
          Solo lo ven los miembros de esta comunidad. Es para conversar; lo que haya que decidir va por inquietudes y
          votaciones. Guardián solo responde cuando lo llamas y solo recibe ese mensaje.
        </p>
      </form>
    </section>
  );
}
