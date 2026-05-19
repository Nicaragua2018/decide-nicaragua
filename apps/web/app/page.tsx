import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Decide Nicaragua — Plataforma de participación democrática',
  description:
    'Infraestructura digital para la participación democrática verificable, la transparencia organizativa y la toma de decisiones auditables.',
};

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-white)' }}>
      {/* Navbar mínima */}
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="navbar-brand">
            Decide <span>Nicaragua</span>
          </span>
          <div className="navbar-links">
            <Link href="/login" className="navbar-link">Iniciar sesión</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
        color: '#fff',
        padding: '5rem 1rem 4rem',
        textAlign: 'center',
      }}>
        <div className="container">
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, marginBottom: '1rem', lineHeight: 1.15 }}>
            Participa en las decisiones<br />que construyen Nicaragua
          </h1>
          <p style={{ fontSize: '1.15rem', opacity: 0.9, maxWidth: 600, margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
            Una plataforma de participación democrática verificable para ciudadanas y ciudadanos
            nicaragüenses, empezando por la diáspora.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              background: '#fff',
              color: '#1D4ED8',
              fontWeight: 700,
              padding: '0.85rem 2rem',
              borderRadius: '8px',
              fontSize: '1rem',
              textDecoration: 'none',
            }}>
              Iniciar sesión
            </Link>
            <Link href="/explore" style={{
              background: 'transparent',
              color: '#fff',
              fontWeight: 600,
              padding: '0.85rem 2rem',
              borderRadius: '8px',
              fontSize: '1rem',
              border: '2px solid rgba(255,255,255,0.7)',
              textDecoration: 'none',
            }}>
              Explorar como observador
            </Link>
          </div>
          <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', opacity: 0.75 }}>
            El acceso de miembros es por invitación.{' '}
            <Link href="/login" style={{ color: '#fff', textDecoration: 'underline' }}>
              ¿Tienes un código?
            </Link>
          </p>
        </div>
      </section>

      {/* Características */}
      <section style={{ padding: '4rem 1rem', background: 'var(--bg)' }}>
        <div className="container">
          <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 700, marginBottom: '2.5rem' }}>
            ¿Qué puedes hacer aquí?
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {features.map((f) => (
              <div key={f.title} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
                <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '1rem' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principios */}
      <section style={{ padding: '4rem 1rem', background: 'var(--bg-white)' }}>
        <div className="container" style={{ maxWidth: 680, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
            Construida sobre confianza verificable
          </h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
            Cada decisión queda registrada con trazabilidad. Los sorteos son verificables
            de forma independiente. Las votaciones usan el método Condorcet para reflejar
            la preferencia real de la comunidad.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/explore" className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>
              Ver actividad pública
            </Link>
            <Link href="/login" className="btn btn-ghost" style={{ fontSize: '1rem', padding: '0.75rem 1.75rem' }}>
              Acceder a mi cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '1.5rem 1rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
      }}>
        <p>Decide Nicaragua · <a href="mailto:decidenicaragua@gmail.com">decidenicaragua@gmail.com</a></p>
        <p style={{ marginTop: '0.25rem', opacity: 0.7 }}>
          Código abierto · Auditable · Sin ánimo de lucro
        </p>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: '🗳️',
    title: 'Votación Condorcet',
    desc: 'Expresa preferencias ordenadas. El resultado refleja la voluntad real de la mayoría.',
  },
  {
    icon: '🎲',
    title: 'Sortición verificable',
    desc: 'Selección aleatoria de representantes con semilla pública y resultado comprobable.',
  },
  {
    icon: '💬',
    title: 'Deliberación estructurada',
    desc: 'Propuestas, debates y consenso organizado, no un muro de quejas.',
  },
  {
    icon: '🔍',
    title: 'Auditoría pública',
    desc: 'Cada acción importante queda registrada y es verificable de forma independiente.',
  },
];
