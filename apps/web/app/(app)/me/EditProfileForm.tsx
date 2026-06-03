'use client';

import { useState } from 'react';
import type { AuthResponse } from '@decide/shared';
import { NICARAGUA_DEPARTMENTS } from '@decide/shared';

interface Props {
  current: AuthResponse['user'];
}

export default function EditProfileForm({ current }: Props) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(current.displayName ?? '');
  const [birthDepartment, setBirthDepartment] = useState(current.birthDepartment ?? '');
  const [currentCountry, setCurrentCountry] = useState(current.currentCountry ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {};
      if (displayName.trim()) body.displayName = displayName.trim();
      body.birthDepartment = birthDepartment || null;
      body.currentCountry = currentCountry.toUpperCase() || null;

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string | string[] };
        const msg = Array.isArray(data.message) ? (data.message[0] ?? 'Error al guardar') : (data.message ?? 'Error al guardar');
        setError(msg);
        return;
      }

      setSuccess(true);
      setOpen(false);
      // Recargar la página para reflejar los cambios
      window.location.reload();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary mt-4" onClick={() => setOpen(true)}>
        Editar perfil
      </button>
    );
  }

  return (
    <form className="card mt-4" style={{ maxWidth: 480 }} onSubmit={(e) => { void handleSubmit(e); }}>
      <h2 className="section-title">Editar perfil</h2>

      <div className="form-group">
        <label className="form-label" htmlFor="displayName">Nombre público</label>
        <input
          id="displayName"
          className="form-input"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={50}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="birthDepartment">Departamento de origen</label>
        <select
          id="birthDepartment"
          className="form-input"
          value={birthDepartment}
          onChange={(e) => setBirthDepartment(e.target.value)}
        >
          <option value="">— No especificado —</option>
          {NICARAGUA_DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="currentCountry">
          País de residencia <span style={{ fontWeight: 400, opacity: 0.7 }}>(código ISO, ej: CR, MX, US)</span>
        </label>
        <input
          id="currentCountry"
          className="form-input"
          type="text"
          value={currentCountry}
          onChange={(e) => setCurrentCountry(e.target.value.toUpperCase())}
          maxLength={2}
          pattern="[A-Z]{2}"
          placeholder="CR"
        />
      </div>

      {error && <div className="alert alert-error mt-2">{error}</div>}
      {success && <div className="alert alert-success mt-2">Perfil actualizado.</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={loading}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
