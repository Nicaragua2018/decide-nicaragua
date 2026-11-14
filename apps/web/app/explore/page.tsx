import Link from 'next/link';
import type { Metadata } from 'next';
import { Volver } from '@/components/Volver';

export const metadata: Metadata = {
  title: 'Cómo funciona',
  description:
    'Cómo funciona Nicaragua Decide por dentro: propuestas, elecciones, sorteos y auditoría. El contenido es privado y solo lo ven los miembros.',
};

export default function ExplorePage() {
  return (
    <div className="ex-root">
      <a href="#main-content" className="skip-link">Ir al contenido principal</a>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="ln-nav">
        <div className="ln-nav-inner">
          <Link href="/" className="ln-brand" style={{ textDecoration: 'none' }}>
            Nicaragua <em>Decide</em>
          </Link>
          <div className="ln-nav-actions">
            <Volver href="/">Inicio</Volver>
            <a href="#contacto" className="ln-nav-link">Contacto</a>
            <Link href="/login" className="ln-nav-cta">Registrarme</Link>
          </div>
        </div>
      </nav>

      {/* ── Observer banner ─────────────────────────────────────── */}
      <div className="ex-banner">
        <span className="ex-badge">Privado</span>
        Lo que se publica dentro de la plataforma solo lo ven los miembros, para proteger a quien participa.
        <Link href="/login" className="ex-banner-link">Registrarme para participar →</Link>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="ex-header">
        <div className="ln-container">
          <span className="ln-label">Cómo funciona</span>
          <h1 className="ex-title">
            Cómo funciona<br /><em>por dentro.</em>
          </h1>
          <p className="ex-subtitle">
            Aquí te explicamos qué hacen los miembros: proponer, debatir, votar, sortear y
            revisar la auditoría. Ese contenido es privado y solo se ve con una cuenta,
            porque protege a quien participa. Para entrar, necesitas registrarte.
          </p>
          <Link href="/login" className="ln-btn-primary" style={{ marginTop: '0.5rem' }}>
            Quiero participar
          </Link>
        </div>
      </header>

      {/* ── Resumen ejecutivo ───────────────────────────────────── */}
      <section className="ex-brief" id="main-content">
        <div className="ln-container ex-brief-inner">
          <div className="ex-brief-lead">
            <span className="ln-label">Resumen ejecutivo</span>
            <h2 className="ex-brief-title">
              ¿Qué es<br /><em>Nicaragua Decide?</em>
            </h2>
          </div>
          <div className="ex-brief-body">
            <p>
              Nicaragua Decide es una <strong>infraestructura digital para la participación
              democrática verificable</strong> diseñada para ciudadanas y ciudadanos
              nicaragüenses — comenzando por los cientos de miles que viven en el exilio.
            </p>
            <p>
              Desde 2018, la represión sistemática del régimen de Ortega-Murillo ha
              destruido los espacios democráticos dentro del país: partidos disueltos,
              asambleas prohibidas, líderes encarcelados o exiliados. La comunidad
              nicaragüense en la diáspora — dispersa en más de 40 países — carece de
              un espacio común, legítimo y auditable donde organizarse y decidir.
            </p>
            <p>
              Esta plataforma no es una red social ni un foro de quejas. Es una
              <strong> herramienta de gobernanza seria</strong> con tres principios
              centrales: identidad verificable de los participantes, procesos de
              decisión auditables por cualquier persona, y resultados que no pueden
              ser alterados ni manipulados.
            </p>

            <div className="ex-brief-stats">
              {stats.map((s) => (
                <div key={s.label} className="ex-stat">
                  <span className="ex-stat-num">{s.num}</span>
                  <span className="ex-stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            <blockquote className="ex-brief-quote">
              &#8220;No pedimos fe ciega. Pedimos que verifiques cada resultado
              de forma independiente. Eso es exactamente lo que esta
              plataforma está diseñada para permitir.&#8221;
            </blockquote>

            <p>
              La fase inicial opera en círculo cerrado con miembros invitados de la
              diáspora. La arquitectura está diseñada para escalar hacia adentro
              del país cuando las condiciones políticas lo permitan. El código
              es abierto y auditable por cualquier persona.
            </p>
          </div>
        </div>
      </section>

      {/* ── Navegación de secciones ─────────────────────────────── */}
      <nav className="ex-section-nav" aria-label="Secciones">
        <div className="ln-container ex-section-nav-inner">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="ex-section-tab">
              <span className="ex-section-tab-num">{s.num}</span>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* ── Secciones ───────────────────────────────────────────── */}
      <main>
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="ex-section"
            style={{ background: i % 2 === 0 ? '#fff' : 'var(--ln-parch)' }}
          >
            <div className="ln-container ex-section-inner">

              {/* Info */}
              <div className="ex-section-info">
                <span className="ex-section-num">{s.num}</span>
                <h2 className="ex-section-title">{s.label}</h2>
                <p className="ex-section-desc">{s.desc}</p>
                <ul className="ex-capabilities">
                  {s.canSee.map((item) => (
                    <li key={item} className="ex-cap ex-cap--yes">
                      <span>✓</span>{item}
                    </li>
                  ))}
                  {s.cannotDo.map((item) => (
                    <li key={item} className="ex-cap ex-cap--no">
                      <span>✕</span>{item}
                    </li>
                  ))}
                </ul>
                <div className="ex-phase-badge">
                  <span className="ex-phase-dot" />
                  Solo para miembros
                </div>
              </div>

              {/* Preview */}
              <div className="ex-preview">
                <div className="ex-preview-header">
                  <span className="ex-preview-title">{s.label}</span>
                  <span className="ex-preview-lock">Privado</span>
                </div>
                <div className="ex-preview-body">
                  {s.preview.map((row, j) => (
                    <div key={j} className="ex-preview-row">
                      <div className="ex-preview-row-main">
                        <div className="ex-skel ex-skel--title" style={{ width: row.titleW }} />
                        <div className="ex-skel ex-skel--meta" style={{ width: row.metaW }} />
                      </div>
                      <div className={`ex-preview-status ex-preview-status--${row.status}`}>
                        {row.statusLabel}
                      </div>
                    </div>
                  ))}
                  <div className="ex-preview-overlay">
                    <span>Visible solo para miembros</span>
                  </div>
                </div>
              </div>

            </div>
          </section>
        ))}
      </main>

      {/* ── Contacto ────────────────────────────────────────────── */}
      <section id="contacto" className="ex-contact">
        <div className="ln-container ex-contact-inner">
          <div>
            <span className="ln-label ln-label--light">Contacto institucional</span>
            <h2 className="ex-contact-title">¿Tienes preguntas<br />o quieres colaborar?</h2>
            <p className="ex-contact-body">
              Para consultas sobre la plataforma, acceso de organizaciones
              o propuestas de colaboración con la sociedad civil nicaragüense.
            </p>
          </div>
          <div className="ex-contact-cta">
            <a href="mailto:admin@nicaraguadecide.org" className="ex-contact-email">
              admin@nicaraguadecide.org
            </a>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/login" className="ln-btn-white" style={{ fontSize: '0.875rem', padding: '0.7rem 1.5rem' }}>
                Registrarme
              </Link>
              <Link href="/" className="ln-btn-ghost-white" style={{ fontSize: '0.875rem', padding: '0.7rem 1.5rem' }}>
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="ln-footer">
        <div className="ln-container ln-footer-inner">
          <span className="ln-brand ln-brand--light">Nicaragua <em>Decide</em></span>
          <div className="ln-footer-links">
            <Link href="/representantes" className="ln-footer-link">Quiénes nos representan</Link>
          </div>
          <span>Código abierto · Auditable · Sin ánimo de lucro</span>
        </div>
      </footer>

    </div>
  );
}

const stats = [
  { num: '+700 mil', label: 'nicaragüenses en el exilio' },
  { num: '+40',      label: 'países de la diáspora' },
  { num: '2018',     label: 'inicio de la represión sistemática' },
  { num: '100%',     label: 'código abierto y auditable' },
];

const sections = [
  {
    id:    'proposals',
    num:   '01',
    label: 'Propuestas',
    desc:  'Las propuestas que los grupos ponen a debate. Los miembros leen el texto completo, dicen si apoyan, se mantienen neutrales u objetan, y comentan.',
    canSee:   ['Leer propuestas completas', 'Dar su posición: apoya, neutral u objeta', 'Comentar y debatir'],
    cannotDo: ['Nada se publica fuera de la plataforma'],
    preview: [
      { titleW: '72%', metaW: '45%', status: 'open',   statusLabel: 'Abierta' },
      { titleW: '60%', metaW: '38%', status: 'open',   statusLabel: 'Abierta' },
      { titleW: '80%', metaW: '52%', status: 'closed', statusLabel: 'Cerrada' },
    ],
  },
  {
    id:    'elections',
    num:   '02',
    label: 'Elecciones',
    desc:  'Elecciones con el método Condorcet-Schulze. Los miembros ven las candidaturas, votan en secreto y, al cerrar, revisan los resultados completos con sus matrices de preferencia.',
    canSee:   ['Ver candidaturas y descripción', 'Votar en secreto', 'Revisar resultados y matrices'],
    cannotDo: ['Nadie ve cómo votó cada persona'],
    preview: [
      { titleW: '65%', metaW: '48%', status: 'open',    statusLabel: 'Votando' },
      { titleW: '55%', metaW: '40%', status: 'tallied', statusLabel: 'Contada' },
    ],
  },
  {
    id:    'sortition',
    num:   '03',
    label: 'Sortición',
    desc:  'Sorteos de representantes con el método Fisher-Yates y una semilla SHA-256. Los miembros ven quiénes entraron al sorteo y quiénes salieron, y pueden repetir el cálculo con la semilla para comprobarlo.',
    canSee:   ['Ver sorteos hechos y pendientes', 'Ver la semilla de verificación', 'Repetir el resultado por su cuenta'],
    cannotDo: ['Nadie puede elegir el resultado a mano'],
    preview: [
      { titleW: '68%', metaW: '50%', status: 'completed', statusLabel: 'Ejecutado' },
      { titleW: '58%', metaW: '42%', status: 'pending',   statusLabel: 'Pendiente' },
    ],
  },
  {
    id:    'audit',
    num:   '04',
    label: 'Auditoría',
    desc:  'Un registro que solo crece y nunca se borra: invitaciones, entradas, propuestas, votos emitidos y sorteos. Cada evento lleva una huella de integridad que los miembros pueden verificar.',
    canSee:   ['Ver los eventos por fecha', 'Ver qué se hizo y sobre qué', 'Verificar las huellas de integridad'],
    cannotDo: ['Nunca muestra correos ni el sentido de un voto'],
    preview: [
      { titleW: '55%', metaW: '62%', status: 'verified', statusLabel: 'Verificado' },
      { titleW: '60%', metaW: '55%', status: 'verified', statusLabel: 'Verificado' },
      { titleW: '48%', metaW: '58%', status: 'verified', statusLabel: 'Verificado' },
    ],
  },
];
