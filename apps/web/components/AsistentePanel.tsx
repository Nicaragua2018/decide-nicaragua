'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { esRutaInterna } from '@/lib/rutas';
import { useAsistente } from '@/components/asistente/AsistenteContexto';
import { Guardian } from '@/components/guardian/Guardian';
import type { MensajePanel, RespuestaPanel } from '@decide/shared';

const MAX_MENSAJES = 12;
const MAX_CARACTERES = 1000;
const TEXTO_DESCANSA = 'Guardián descansa hasta el próximo mes.';
const BIENVENIDA = 'Hola, soy Guardián. Pregúntame cómo plantear una inquietud, apoyar una pregunta o preparar una elección.';
const RAPIDAS = ['¿Cómo planteo una inquietud?', '¿Cómo apoyo una pregunta?', '¿Qué es una elección?'];
const TEXTO_ERROR = 'Ahora no pude responder. Intenta de nuevo en un momento.';

type Linea = MensajePanel & { enlaces?: { texto: string; ruta: string }[]; aviso?: boolean };

export default function AsistentePanel() {
  const { activo, topeAlcanzado, abierto, cerrar: cerrarContexto } = useAsistente();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const generacion = useRef(0);
  const estuvoAbierto = useRef(false);

  function cerrar() {
    generacion.current += 1; // descarta cualquier respuesta que aún viaje
    cerrarContexto();
    setLineas([]);
    setTexto('');
    setPensando(false);
  }

  useEffect(() => {
    if (abierto) {
      estuvoAbierto.current = true;
      areaRef.current?.focus();
    } else if (estuvoAbierto.current) {
      Array.from(document.querySelectorAll<HTMLElement>('[data-guardian-boton]')).find((b) => b.offsetParent !== null)?.focus();
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

  async function enviar(rapida?: string) {
    const pregunta = (rapida ?? texto).trim();
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

  if (!activo) return null;

  return (
    <>
      {abierto && (
        <aside className="guardian-panel" role="dialog" aria-modal="true" aria-label="Guardián">
          <div className="guardian-cabecera">
            <span className="guardian-avatar">
              <Guardian tamano={38} />
            </span>
            <div className="guardian-titulo">
              <strong>Guardián</strong>
              <span>te ayuda a usar la plataforma</span>
            </div>
            <button type="button" className="guardian-cerrar" aria-label="Cerrar a Guardián" onClick={cerrar}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="guardian-mensajes" aria-live="polite">
            {topeAlcanzado ? (
              <p className="alert alert-info">{TEXTO_DESCANSA}</p>
            ) : (
              lineas.length === 0 && (
                <>
                  <div className="guardian-burbuja">
                    <p>{BIENVENIDA}</p>
                  </div>
                  <div className="guardian-rapidas">
                    {RAPIDAS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="guardian-rapida"
                        disabled={pensando}
                        onClick={() => {
                          setTexto(q);
                          void enviar(q);
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )
            )}
            {lineas.map((l, i) =>
              l.rol === 'persona' ? (
                <p key={i} className="guardian-burbuja-persona">{l.texto}</p>
              ) : l.aviso ? (
                <p key={i} className="alert alert-info">{l.texto}</p>
              ) : (
                <div key={i} className="guardian-burbuja">
                  <p className="guardian-marca">
                    <Guardian tamano={20} />
                    sugerencia de Guardián
                  </p>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{l.texto}</p>
                  {l.enlaces && l.enlaces.length > 0 && (
                    <ul className="guardian-enlaces">
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
            {pensando && (
              <div className="guardian-escribiendo">
                <span>Guardián está escribiendo</span>
                <div aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>
          <div className="guardian-pie">
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
            <p className="form-hint">Guardián puede equivocarse. No guarda esta conversación.</p>
          </div>
        </aside>
      )}
    </>
  );
}
