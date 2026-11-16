'use client';

import { useEffect, useState } from 'react';
import { INVITE_TOKEN_TTL_HOURS } from '@decide/shared';
import { VIDEO_INVITACION, mensajeInvitacionPersonal } from '@/app/portada/invitacion';

const NOMBRE_VIDEO = 'Nicaragua-Decide-invitacion.mp4';

/**
 * Tras crear una invitación: el mensaje con el enlace personal, listo para
 * enviarlo por WhatsApp. En el teléfono puede salir junto con el video.
 */
export default function CompartirInvitacion({ enlace }: { enlace: string }) {
  const [mensaje, setMensaje] = useState(() => mensajeInvitacionPersonal(enlace, INVITE_TOKEN_TTL_HOURS));
  const [aviso, setAviso] = useState('');
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setMensaje(mensajeInvitacionPersonal(enlace, INVITE_TOKEN_TTL_HOURS));
    setAviso('');
  }, [enlace]);

  // Solo los teléfonos (y algunos navegadores) saben compartir un archivo con texto.
  useEffect(() => {
    try {
      const prueba = new File([''], NOMBRE_VIDEO, { type: 'video/mp4' });
      setPuedeCompartir(typeof navigator.canShare === 'function' && navigator.canShare({ files: [prueba] }));
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setAviso('Mensaje copiado.');
    } catch {
      setAviso('No se pudo copiar; selecciona el texto y cópialo a mano.');
    }
  }

  async function compartirConVideo() {
    setOcupado(true);
    setAviso('');
    try {
      const res = await fetch(VIDEO_INVITACION);
      if (!res.ok) throw new Error('video');
      const video = new File([await res.blob()], NOMBRE_VIDEO, { type: 'video/mp4' });
      // Algunas aplicaciones descartan el texto cuando reciben un archivo: queda copiado por si acaso.
      await navigator.clipboard.writeText(mensaje).catch(() => undefined);
      await navigator.share({ files: [video], text: mensaje });
      setAviso('Si el mensaje no llegó junto al video, pégalo: quedó copiado.');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setAviso('No se pudo compartir el video desde aquí. Descárgalo y adjúntalo a mano.');
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="mb-4" aria-labelledby="compartir-invitacion">
      <h2 id="compartir-invitacion" className="card-title">Enviarla también por WhatsApp</h2>
      <p className="form-hint mb-1">
        Este mensaje lleva el enlace personal de la persona invitada. Es de un solo uso: envíalo solo a ella.
      </p>
      <div className="form-field">
        <label htmlFor="mensaje-invitacion" className="form-label">Mensaje de invitación</label>
        <textarea
          id="mensaje-invitacion"
          className="form-textarea"
          rows={10}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <a
          className="btn btn-primary btn-sm"
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Enviar por WhatsApp
        </a>
        {puedeCompartir && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={compartirConVideo} disabled={ocupado}>
            {ocupado ? 'Preparando el video…' : 'Compartir con el video'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}>
          Copiar mensaje
        </button>
        <a className="btn btn-ghost btn-sm" href={VIDEO_INVITACION} download={NOMBRE_VIDEO}>
          Descargar el video
        </a>
      </div>
      {aviso && <p className="form-hint" role="status">{aviso}</p>}
    </section>
  );
}
