'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NICARAGUA_DEPARTMENTS, MIN_PASSWORD_LENGTH } from '@decide/shared';

export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = e.currentTarget;
    const password        = (form.elements.namedItem('password') as HTMLInputElement).value;
    const passwordConfirm = (form.elements.namedItem('passwordConfirm') as HTMLInputElement).value;
    const displayName     = (form.elements.namedItem('displayName') as HTMLInputElement).value;
    const birthDepartment = (form.elements.namedItem('birthDepartment') as HTMLSelectElement).value;
    const currentCountry  = (form.elements.namedItem('currentCountry') as HTMLInputElement).value;

    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.');
      setLoading(false);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      setLoading(false);
      return;
    }

    try {
      const body: Record<string, string> = {
        token,
        password,
        displayName,
      };
      if (birthDepartment) body['birthDepartment'] = birthDepartment;
      if (currentCountry)  body['currentCountry']  = currentCountry.toUpperCase();

      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push('/login?registered=1');
      } else {
        const data = await res.json() as { message?: string };
        setError(data.message ?? 'Token inválido o expirado.');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <h1 className="auth-title">Completa tu registro</h1>
        <p className="auth-sub">Configura tu cuenta en Decide Nicaragua</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form className="form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="displayName">Nombre público</label>
            <input id="displayName" name="displayName" type="text"
              required minLength={2} maxLength={50} className="form-input" />
            <span className="form-hint">Nombre que verán otros miembros.</span>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password"
              required minLength={MIN_PASSWORD_LENGTH} maxLength={128}
              autoComplete="new-password" className="form-input" />
            <span className="form-hint">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</span>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="passwordConfirm">Confirmar contraseña</label>
            <input id="passwordConfirm" name="passwordConfirm" type="password"
              required autoComplete="new-password" className="form-input" />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="birthDepartment">
              Departamento de nacimiento <span className="text-muted">(opcional)</span>
            </label>
            <select id="birthDepartment" name="birthDepartment" className="form-select">
              <option value="">— Seleccionar —</option>
              {NICARAGUA_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="currentCountry">
              País de residencia actual <span className="text-muted">(opcional, código ISO: CR, MX, US…)</span>
            </label>
            <input id="currentCountry" name="currentCountry" type="text"
              maxLength={2} pattern="[A-Za-z]{2}" className="form-input"
              style={{ maxWidth: 80 }} />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Registrando…' : 'Completar registro'}
          </button>
        </form>
      </div>
    </div>
  );
}
