'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { esRutaInterna } from '@/lib/rutas';
import type { MensajePanel, RespuestaPanel } from '@decide/shared';

const MAX_MENSAJES = 12;
const MAX_CARACTERES = 1000;
const TEXTO_DESCANSA = 'El asistente descansa hasta el próximo mes.';
const TEXTO_ERROR = 'Ahora no pude responder. Intenta de nuevo en un momento.';

type Linea = MensajePanel & { enlaces?: { texto: string; ruta: string }[]; aviso?: boolean };

export default function AsistentePanel({ topeAlcanzado }: { topeAlcanzado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const generacion = useRef(0);
  const estuvoAbierto = useRef(false);

  function cerrar() {
    generacion.current += 1; // descarta cualquier respuesta que aún viaje
    setAbierto(false);
    setLineas([]);
    setTexto('');
    setPensando(false);
  }

  useEffect(() => {
    if (abierto) {
      estuvoAbierto.current = true;
      areaRef.current?.focus();
    } else if (estuvoAbierto.current) {
      botonRef.current?.focus();
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  useEffect(() => {
    finRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lineas, pensando]);

  async function enviar() {
    const pregunta = texto.trim();
    if (!pregunta || pensando || topeAlcanzado) return;
    const nuevas: Linea[] = [...lineas, { rol: 'persona', texto: pregunta }];
    setLineas(nuevas);
    setTexto('');
    setPensando(true);
    const miGeneracion = generacion.current;
    const mensajes: MensajePanel[] = nuevas
      .filter((l) => !l.aviso)
      .slice(-MAX_MENSAJES)
      .map((l) => ({ rol: l.rol, texto: l.texto.slice(0, MAX_CARACTERES) }));
    // La conversación debe empezar con una pregunta de la persona.
    while (mensajes.length > 0 && mensajes[0]!.rol !== 'persona') mensajes.shift();
    let nueva: Linea;
    try {
      const res = await fetch('/api/asistente/preguntar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as RespuestaPanel;
      if (r.tipo === 'respuesta') nueva = { rol: 'asistente', texto: r.texto, enlaces: r.enlaces };
      else if (r.tipo === 'limite') nueva = { rol: 'asistente', aviso: true, texto: `Llegaste a las ${r.maximo} preguntas de hoy. Mañana puedes seguir.` };
      else nueva = { rol: 'asistente', aviso: true, texto: TEXTO_DESCANSA };
    } catch {
      nueva = { rol: 'asistente', aviso: true, texto: TEXTO_ERROR };
    }
    if (miGeneracion !== generacion.current) return;
    setLineas((prev) => [...prev, nueva]);
    setPensando(false);
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <>
      {!abierto && (
        <button ref={botonRef} type="button" className="asistente-boton btn btn-primary" aria-label="Pregúntale al asistente" onClick={() => setAbierto(true)}>
          Pregúntale al asistente
        </button>
      )}
      {abierto && (
        <aside className="asistente-panel" role="dialog" aria-modal="true" aria-label="Asistente">
          <div className="asistente-cabecera">
            <strong>Asistente</strong>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar el asistente" onClick={cerrar}>
              Cerrar
            </button>
          </div>
          <div className="asistente-mensajes" aria-live="polite">
            {topeAlcanzado ? (
              <p className="alert alert-info">{TEXTO_DESCANSA}</p>
            ) : (
              lineas.length === 0 && <p className="text-sm">Hazme una pregunta sobre cómo usar la plataforma.</p>
            )}
            {lineas.map((l, i) =>
              l.rol === 'persona' ? (
                <p key={i} className="asistente-msg asistente-msg-persona">{l.texto}</p>
              ) : l.aviso ? (
                <p key={i} className="alert alert-info">{l.texto}</p>
              ) : (
                <div key={i} className="asistente-msg asistente-msg-asistente">
                  <p className="marca-asistente">sugerencia del asistente</p>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{l.texto}</p>
                  {l.enlaces && l.enlaces.length > 0 && (
                    <ul className="asistente-enlaces">
                      {l.enlaces.map((e, j) => (
                        <li key={`${e.ruta}-${j}`}>
                          {esRutaInterna(e.ruta) ? <Link href={e.ruta} onClick={cerrar}>{e.texto}</Link> : e.texto}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
            {pensando && <p className="text-sm">Pensando…</p>}
            <div ref={finRef} />
          </div>
          <div className="asistente-pie">
            <textarea
              ref={areaRef}
              className="form-textarea"
              rows={2}
              aria-label="Tu pregunta"
              value={texto}
              maxLength={MAX_CARACTERES}
              disabled={topeAlcanzado}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={pensando || topeAlcanzado || texto.trim() === ''} onClick={() => void enviar()}>
              {pensando ? 'Pensando…' : 'Enviar'}
            </button>
            <p className="form-hint">El asistente puede equivocarse. No guarda esta conversación.</p>
          </div>
        </aside>
      )}
    </>
  );
}
