'use client';

import { useActionState } from 'react';
import { subscribeNewsletter } from '@/lib/actions';
import type { ActionResult } from '@/lib/actions';

interface Props {
  compact?: boolean;
}

export function NewsletterForm({ compact = false }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    subscribeNewsletter,
    null,
  );

  const success = state && 'success' in state;
  const error   = state && 'error' in state ? state.error : null;

  if (success) {
    return (
      <div className="nl-success" role="status">
        <span className="nl-success-icon" aria-hidden="true">✓</span>
        <p>Suscripción confirmada. Te mantendremos informado.</p>
      </div>
    );
  }

  return (
    <form action={action} className={compact ? 'nl-form nl-form--compact' : 'nl-form'}>
      {!compact && (
        <div className="nl-field">
          <label htmlFor="nl-name" className="nl-label">Nombre (opcional)</label>
          <input
            id="nl-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Tu nombre…"
            className="nl-input"
          />
        </div>
      )}

      <div className={compact ? 'nl-field nl-field--row' : 'nl-field'}>
        {!compact && (
          <label htmlFor="nl-email" className="nl-label">Correo electrónico</label>
        )}
        <input
          id="nl-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          placeholder="tu@correo.com…"
          className="nl-input"
          aria-label={compact ? 'Correo electrónico' : undefined}
        />
        <button type="submit" disabled={pending} className="nl-btn">
          {pending ? 'Enviando…' : 'Suscribirme'}
        </button>
      </div>

      {error && (
        <p className="nl-error" role="alert" aria-live="polite">{error}</p>
      )}

      <p className="nl-note">
        Sin spam. Solo actualizaciones sobre la plataforma y la democracia nicaragüense.
        Puedes darte de baja en cualquier momento.
      </p>
    </form>
  );
}
