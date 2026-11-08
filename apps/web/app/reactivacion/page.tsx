'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { TEXTO_REACTIVACION_MAX, type CasoSuspension } from '@decide/shared';
import { pedirReactivacion, verCasoSuspension } from '@/lib/actions';

const TEXTO_MIN = 10;
const SIN_PASE = 'Vuelve a entrar con tu contraseña para ver tu caso.';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ReactivacionPage() {
  const [token, setToken] = useState<string | null>(null);
  const [caso, setCaso] = useState<CasoSuspension | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const yaPedido = useRef(false);

  // El caso se pide UNA vez por carga: comparte el límite de intentos del inicio de sesión.
  useEffect(() => {
    if (yaPedido.current) return;
    yaPedido.current = true;
    let t: string | null = null;
    try {
      t = sessionStorage.getItem('reactivacionToken');
    } catch {
      t = null;
    }
    if (!t) {
      setAviso(SIN_PASE);
      setCargando(false);
      return;
    }
    setToken(t);
    void verCasoSuspension(t).then((r) => {
      if ('error' in r) setAviso(r.error);
      else setCaso(r.caso);
      setCargando(false);
    });
  }, []);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || enviando) return;
    setError(null);
    setEnviando(true);
    const r = await pedirReactivacion(token, texto.trim());
    setEnviando(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setCaso(r.caso);
    setTexto('');
  }

  const solicitud = caso?.solicitud ?? null;
  const puedePedir = caso !== null && solicitud?.estado !== 'pendiente';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Tu cuenta está suspendida</h1>

        {cargando && <p className="auth-sub">Cargando tu caso…</p>}

        {aviso && (
          <>
            <p className="alert alert-error" role="alert">{aviso}</p>
            <p><Link href="/login">Volver a entrar</Link></p>
          </>
        )}

        {caso && (
          <>
            <p className="auth-sub">Suspendida el {fecha(caso.suspendidaAt)}.</p>
            <div className="card">
              <p className="card-title">Motivo de la suspensión</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{caso.motivo}</p>
            </div>

            {solicitud?.estado === 'pendiente' && (
              <p className="alert alert-info" role="status">
                Tu pedido está pendiente. La mesa lo revisará. Lo enviaste el {fecha(solicitud.createdAt)}.
              </p>
            )}
            {solicitud?.estado === 'rechazada' && (
              <div className="alert alert-warning" role="status">
                <p>La mesa rechazó tu último pedido.</p>
                {solicitud.motivoRechazo && <p style={{ whiteSpace: 'pre-wrap' }}>Motivo: {solicitud.motivoRechazo}</p>}
                {caso.puedePedirDesde && <p>Puedes volver a pedirlo desde el {fecha(caso.puedePedirDesde)}.</p>}
              </div>
            )}

            {puedePedir && (
              <form className="form" onSubmit={(e) => void enviar(e)}>
                <div className="form-field">
                  <label className="form-label" htmlFor="reactivacion-texto">
                    Cuéntale a la mesa por qué debería reactivarse tu cuenta (mínimo {TEXTO_MIN} caracteres)
                  </label>
                  <textarea
                    id="reactivacion-texto"
                    className="form-textarea"
                    required
                    minLength={TEXTO_MIN}
                    maxLength={TEXTO_REACTIVACION_MAX}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <span className="form-hint">{texto.length} de {TEXTO_REACTIVACION_MAX} caracteres</span>
                </div>
                {error && <p className="alert alert-error" role="alert">{error}</p>}
                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={enviando || texto.trim().length < TEXTO_MIN}
                >
                  {enviando ? 'Enviando…' : 'Pedir la reactivación'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
