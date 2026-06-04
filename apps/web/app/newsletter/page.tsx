import type { Metadata } from 'next';
import Link from 'next/link';
import { NewsletterForm } from './NewsletterForm';

export const metadata: Metadata = {
  title: 'Boletín — Decide Nicaragua',
  description:
    'Suscríbete al boletín de Decide Nicaragua y mantente informado sobre la plataforma y la participación democrática nicaragüense.',
};

export default function NewsletterPage() {
  return (
    <div className="ln-root">

      <nav className="ln-nav">
        <div className="ln-nav-inner">
          <Link href="/" className="ln-brand" style={{ textDecoration: 'none' }}>
            Decide <em>Nicaragua</em>
          </Link>
          <div className="ln-nav-actions">
            <Link href="/login" className="ln-nav-cta">Iniciar sesión</Link>
          </div>
        </div>
      </nav>

      <main style={{ background: 'var(--ln-parch)', minHeight: 'calc(100vh - 62px)', padding: '5rem 1.25rem' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <span className="ln-label">Boletín informativo</span>

          <h1 style={{
            fontFamily: 'var(--ln-serif)',
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 700,
            lineHeight: 1.15,
            color: 'var(--ln-navy)',
            marginBottom: '1.5rem',
          }}>
            Mantente informado<br />sobre Nicaragua.
          </h1>

          <p style={{ color: '#4a4a4a', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: '1rem' }}>
            Enviamos actualizaciones sobre el avance de la plataforma, resultados de procesos
            democráticos, análisis de la situación política nicaragüense y convocatorias para
            participar.
          </p>
          <p style={{ color: '#4a4a4a', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: '2.5rem' }}>
            No vendemos ni compartimos datos. Sin spam. Baja en cualquier momento.
          </p>

          <div style={{
            background: '#fff',
            borderRadius: '6px',
            padding: '2.5rem',
            boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <NewsletterForm />
          </div>

          <p style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#888', textAlign: 'center' }}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" style={{ color: 'var(--ln-navy)', textDecoration: 'underline' }}>
              Inicia sesión
            </Link>
            {' '}para participar directamente.
          </p>
        </div>
      </main>

    </div>
  );
}
