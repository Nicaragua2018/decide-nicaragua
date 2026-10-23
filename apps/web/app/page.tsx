import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsletterForm } from './newsletter/NewsletterForm';
import { ShareButton } from './components/ShareButton';

export const metadata: Metadata = {
  title: 'Decide Nicaragua — Plataforma de participación democrática',
  description:
    'Infraestructura digital para la participación democrática verificable, la transparencia organizativa y la toma de decisiones auditables.',
};

export default function LandingPage() {
  return (
    <div className="ln-root">
      <a href="#main-content" className="skip-link">Ir al contenido principal</a>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="ln-nav">
        <div className="ln-nav-inner">
          <span className="ln-brand">Decide <em>Nicaragua</em></span>

          <div className="ln-nav-actions">
            <a href="#contacto" className="ln-nav-link">Contacto</a>
            <ShareButton variant="nav" />
            <Link href="/login" className="ln-nav-cta">Registrarme</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="ln-hero">
        <div className="ln-hero-overlay" />
        <div className="ln-hero-content">
          <p className="ln-eyebrow">Plataforma democrática · Diáspora nicaragüense</p>
          <h1 className="ln-hero-title">
            Nicaragua<br /><em>decide.</em>
          </h1>
          <p className="ln-hero-sub">
            Infraestructura para la participación democrática verificable —
            deliberación legítima y decisiones auditables, desde cualquier
            lugar del mundo.
          </p>

          <div className="ln-cta-group">
            <Link href="/login" className="ln-btn-white">
              Registrarme
            </Link>
            <Link href="/explore" className="ln-btn-ghost-white">
              Ver como observador
            </Link>
            <ShareButton variant="hero" />
          </div>

          <p className="ln-hero-note">
            Acceso por invitación.{' '}
            <Link href="/login">¿Tienes un código?</Link>
          </p>
        </div>
      </section>

      {/* ── Cómo funciona ──────────────────────────────────────── */}
      <section className="ln-how" id="main-content">
        <div className="ln-container">
          <span className="ln-label">01 · Cómo funciona</span>
          <h2 className="ln-section-title">
            Un proceso democrático claro,<br />verificable paso a paso.
          </h2>
          <div className="ln-how-steps">
            {howSteps.map((step, i) => (
              <div key={step.title} className="ln-how-step">
                <span className="ln-how-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="ln-how-body">
                  <strong>{step.title}</strong>
                  <span>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Manifiesto ─────────────────────────────────────────── */}
      <section className="ln-about">
        <div className="ln-container">
          <span className="ln-label">02 · Por qué existimos</span>
          <blockquote className="ln-pullquote">
            &#8220;Cuando los espacios democráticos son destruidos,<br />
            hay que construirlos de nuevo.&#8221;
          </blockquote>
          <div className="ln-about-body">
            <p className="ln-about-lead">
              Desde 2018, cientos de miles de nicaragüenses han sido forzados al exilio.
              Con ellos se fue también la capacidad de organizarse, deliberar y decidir
              colectivamente con legitimidad.
            </p>
            <p>
              Decide Nicaragua nace para llenar ese vacío — con identidad verificable,
              decisiones trazables y resultados auditables por cualquier persona,
              desde cualquier lugar del mundo.
            </p>
          </div>

          <div className="ln-pillars">
            {pillars.map((p, i) => (
              <div key={p.title} className="ln-pillar">
                <span className="ln-pillar-num">0{i + 1}</span>
                <div className="ln-pillar-body">
                  <strong>{p.title}</strong>
                  <span>{p.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Herramientas ───────────────────────────────────────── */}
      <section className="ln-features">
        <div className="ln-container">
          <span className="ln-label ln-label--light">03 · Herramientas</span>
          <h2 className="ln-section-title ln-section-title--light">
            ¿Qué puedes hacer aquí?
          </h2>
          <div className="ln-features-grid">
            {features.map((f) => (
              <div key={f.title} className="ln-feature-card">
                <span className="ln-feature-num">{f.num}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA central ────────────────────────────────────────── */}
      <section className="ln-cta-section">
        <div className="ln-container ln-cta-section-inner">
          <div>
            <h2 className="ln-section-title">
              Cada decisión deja huella.<br />
              Cada resultado es comprobable.
            </h2>
            <p className="ln-trust-body">
              Los sorteos usan semilla pública verificable. Las votaciones aplican el
              método Condorcet. La auditoría es append-only y pública.
            </p>
          </div>
          <div className="ln-cta-section-btns">
            <Link href="/login" className="ln-btn-primary">
              Registrarme para participar
            </Link>
            <Link href="/explore" className="ln-btn-outline">
              Ver como observador
            </Link>
            <ShareButton variant="light" />
          </div>
        </div>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────── */}
      <section className="ln-newsletter">
        <div className="ln-container ln-newsletter-inner">
          <div className="ln-newsletter-copy">
            <span className="ln-label">04 · Boletín</span>
            <h2 className="ln-section-title">Mantente informado<br />sobre el proceso.</h2>
            <p className="ln-newsletter-sub">
              Actualizaciones sobre la plataforma, análisis político y convocatorias.
              Sin spam. Baja cuando quieras.
            </p>
            <Link href="/newsletter" className="ln-newsletter-link">
              Ver página completa →
            </Link>
          </div>
          <div className="ln-newsletter-form">
            <NewsletterForm compact />
          </div>
        </div>
      </section>

      {/* ── Contacto ───────────────────────────────────────────── */}
      <section id="contacto" className="ln-contact">
        <div className="ln-container ln-contact-inner">
          <div>
            <span className="ln-label">05 · Contacto</span>
            <h2 className="ln-contact-title">¿Tienes dudas o quieres colaborar?</h2>
            <p className="ln-contact-body">
              Para preguntas sobre la plataforma, propuestas de colaboración o consultas
              de organizaciones de la sociedad civil nicaragüense.
            </p>
          </div>
          <div className="ln-contact-actions">
            <a href="mailto:decidenicaragua@gmail.com" className="ln-btn-primary">
              Escribirnos
            </a>
            <Link href="/login" className="ln-btn-outline">
              Registrarme
            </Link>
            <ShareButton variant="light" />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="ln-footer">
        <div className="ln-container ln-footer-inner">
          <span className="ln-brand ln-brand--light">Decide <em>Nicaragua</em></span>
          <div className="ln-footer-links">
            <a href="#contacto" className="ln-footer-link">Contacto</a>
            <Link href="/explore" className="ln-footer-link">Modo observador</Link>
            <Link href="/login" className="ln-footer-link">Registrarme</Link>
          </div>
          <span className="ln-footer-copy">Código abierto · Auditable · Sin ánimo de lucro</span>
        </div>
      </footer>
    </div>
  );
}

const howSteps = [
  { title: 'Verifica tu identidad',   desc: 'Confirma que eres ciudadano nicaragüense con acceso por invitación.' },
  { title: 'Únete a tu grupo',        desc: 'Por departamento de origen y país de residencia.' },
  { title: 'Propón y delibera',       desc: 'Crea propuestas, debate y emite señales de consenso.' },
  { title: 'Vota con Condorcet',      desc: 'Expresa preferencias ordenadas para decisiones justas.' },
  { title: 'Audita el resultado',     desc: 'Cada acción queda registrada y es verificable de forma independiente.' },
];

const pillars = [
  { title: 'Identidad verificable',  desc: 'Solo ciudadanos nicaragüenses verificados participan en las decisiones vinculantes.' },
  { title: 'Decisiones auditables',  desc: 'Cada voto y sorteo queda registrado con trazabilidad completa e independiente.' },
  { title: 'Transparencia total',    desc: 'El código es abierto. Los procesos son públicos. No hay cajas negras.' },
  { title: 'Diseño para el exilio',  desc: 'Funciona desde cualquier país. Sin dependencia de infraestructura nicaragüense.' },
];

const features = [
  { num: '01', title: 'Votación Condorcet',       desc: 'Expresa preferencias ordenadas. El resultado refleja la voluntad real de la mayoría.' },
  { num: '02', title: 'Sortición verificable',     desc: 'Selección aleatoria de representantes con semilla pública y resultado comprobable.' },
  { num: '03', title: 'Deliberación estructurada', desc: 'Propuestas, debates y consenso organizado — no un muro de quejas.' },
  { num: '04', title: 'Auditoría pública',         desc: 'Cada acción importante queda registrada y es verificable de forma independiente.' },
];
