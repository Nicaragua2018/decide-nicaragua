import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Explorar — Decide Nicaragua' };

export default function ExplorePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link href="/" className="navbar-brand">
            Decide <span>Nicaragua</span>
          </Link>
          <div className="navbar-links">
            <Link href="/login" className="btn btn-primary btn-sm">Iniciar sesión</Link>
          </div>
        </div>
      </nav>

      <div className="container page">
        <div className="page-header">
          <h1 className="page-title">Modo observador</h1>
          <p className="page-sub">
            Estás explorando Decide Nicaragua sin cuenta. El contenido completo está disponible
            para miembros verificados.
          </p>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</p>
          <h2 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
            Contenido público próximamente
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 2rem', lineHeight: 1.6 }}>
            La plataforma está en fase inicial cerrada. Pronto podrás explorar propuestas,
            resultados de votaciones y registros de auditoría de forma pública.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-primary">
              Acceder con mi cuenta
            </Link>
            <Link href="/" className="btn btn-ghost">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
