'use client';

import { useActionState } from 'react';
import { inviteUser } from '@/lib/actions';
import type { ActionResult } from '@/lib/actions';
import { Volver } from '@/components/Volver';
import CompartirInvitacion from '@/components/CompartirInvitacion';

const initialState: ActionResult | null = null;

export default function AdminInvitePage() {
  const [state, formAction, isPending] = useActionState(inviteUser, initialState);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invitar usuario</h1>
          <p className="page-sub">
            Se enviará un correo con el enlace de activación. Después podrás enviar la misma
            invitación por WhatsApp, con el mensaje y el video. Si invitas de nuevo un correo
            que aún no aceptó, recibe un enlace nuevo.
          </p>
        </div>
        <Volver href="/admin/users">Usuarios</Volver>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form action={formAction}>
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="form-input"
              placeholder="nombre@ejemplo.com"
              autoComplete="off"
            />
          </div>

          {state && 'error' in state && (
            <p className="form-error">{state.error}</p>
          )}

          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </form>

        {state && 'success' in state && (
          <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid var(--border)' }} />
        )}

        {state && 'success' in state && state.emailEnviado === false && (
          <div className="alert alert-warning mb-4" role="alert">
            Invitación creada{state.invitado ? ` para ${state.invitado}` : ''}, pero el correo no se pudo enviar. Envíala por WhatsApp con el
            mensaje de abajo: el enlace es el mismo que iba en el correo.
          </div>
        )}

        {state && 'success' in state && state.emailEnviado !== false && (
          <div className="alert alert-success mb-4">
            Invitación creada{state.invitado ? ` para ${state.invitado}` : ''}.{' '}
            {state.devInviteUrl
              ? 'Email no enviado (modo demo). Comparte este enlace manualmente:'
              : 'El usuario recibirá un correo para activar su cuenta.'}
          </div>
        )}

        {state && 'success' in state && state.devInviteUrl && (
          <div className="mb-4" style={{ background: 'var(--color-surface-2)', borderRadius: 6, padding: '10px 14px' }}>
            <p className="form-hint mb-1">Enlace de activación:</p>
            <code style={{ fontSize: 12, wordBreak: 'break-all', display: 'block', color: 'var(--color-accent)' }}>
              {state.devInviteUrl}
            </code>
          </div>
        )}

        {state && 'success' in state && state.inviteUrl && (
          <CompartirInvitacion key={state.inviteUrl} enlace={state.inviteUrl} para={state.invitado} />
        )}
      </div>
    </>
  );
}
