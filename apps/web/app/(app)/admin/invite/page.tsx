'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { inviteUser } from '@/lib/actions';
import type { ActionResult } from '@/lib/actions';

const initialState: ActionResult | null = null;

export default function AdminInvitePage() {
  const [state, formAction, isPending] = useActionState(inviteUser, initialState);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invitar usuario</h1>
          <p className="page-sub">
            Se enviará un email con el enlace de activación de cuenta.
          </p>
        </div>
        <Link href="/admin/users" className="btn btn-ghost btn-sm">
          ← Usuarios
        </Link>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        {state && 'success' in state && (
          <div className="alert alert-success mb-4">
            Invitación creada.{' '}
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
      </div>
    </>
  );
}
