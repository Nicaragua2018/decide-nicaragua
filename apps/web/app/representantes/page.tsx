import Link from 'next/link';
import type { Metadata } from 'next';
import { CARGO_ETIQUETA, type RepresentantesVista } from '@decide/shared';
import { Hexagono } from '@/components/elecciones/Hexagono';
import { fechaLarga } from '@/components/elecciones/textos';

export const metadata: Metadata = {
  title: 'Quiénes nos representan — Decide Nicaragua',
  description: 'La mesa, los observadores y quienes coordinan cada comunidad de Decide Nicaragua.',
};

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Pública: se lee sin sesión (no se reenvían cookies). */
async function leer(): Promise<RepresentantesVista | null> {
  try {
    const res = await fetch(`${API_URL}/api/representantes`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as RepresentantesVista;
  } catch {
    return null;
  }
}

/** Qué parte del mandato ya pasó, de 0 a 100. */
function avance(desde: string, hasta: string, ahora: number): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (b <= a) return 100;
  return Math.round(Math.min(Math.max((ahora - a) / (b - a), 0), 1) * 100);
}

function Mandato({ desde, hasta, ahora }: { desde: string; hasta: string; ahora: number }) {
  const pct = avance(desde, hasta, ahora);
  return (
    <div className="el-mandato">
      <div
        className="el-mandato-pista"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Parte del mandato que ya pasó"
      >
        <span className="el-mandato-barra" style={{ width: `${pct}%` }} />
      </div>
      <p className="el-nota">
        Desde el {fechaLarga(desde)} hasta el {fechaLarga(hasta)}
      </p>
    </div>
  );
}

export default async function RepresentantesPage() {
  const v = await leer();
  const ahora = Date.now();

  return (
    <div className="ln-root el-publica">
      <a href="#main-content" className="skip-link">Ir al contenido principal</a>
      <nav className="ln-nav">
        <div className="ln-nav-inner">
          <Link href="/" className="ln-brand" style={{ textDecoration: 'none' }}>
            Decide <em>Nicaragua</em>
          </Link>
          <div className="ln-nav-actions">
            <Link href="/explore" className="ln-nav-link">Modo observador</Link>
            <Link href="/login" className="ln-nav-cta">Entrar</Link>
          </div>
        </div>
      </nav>

      <main id="main-content" className="container page el-pagina">
        <div className="page-header">
          <h1 className="page-title">Quiénes nos representan</h1>
          <p className="page-sub">
            Todas estas personas fueron elegidas por la comunidad, o fundaron la plataforma y siguen en funciones hasta su
            elección.
          </p>
        </div>

        {v === null ? (
          <p className="alert alert-error">No se pudo cargar la lista. Prueba de nuevo en un rato.</p>
        ) : (
          <>
            <section className="el-bloque" aria-labelledby="mesa-titulo">
              <h2 id="mesa-titulo" className="el-h2">La mesa</h2>
              {v.mesa.length === 0 ? (
                <p className="el-nota">La mesa todavía no tiene personas.</p>
              ) : (
                <ul className="el-mesa">
                  {v.mesa.map((m) => (
                    <li key={m.tipo} className="el-mesa-persona">
                      <Hexagono texto={m.iniciales} variante="oro" tamano={64} />
                      <div className="el-mesa-datos">
                        <p className="el-etiqueta">{CARGO_ETIQUETA[m.tipo]}</p>
                        <p className="el-ficha-nombre">
                          {m.nombre}
                          {m.fundador && <span className="el-insignia el-insignia-oro">Fundador</span>}
                          {m.enFunciones && <span className="el-insignia el-insignia-azul">En funciones</span>}
                        </p>
                        {m.hasta ? (
                          <Mandato desde={m.desde} hasta={m.hasta} ahora={ahora} />
                        ) : (
                          <p className="el-nota">Desde el {fechaLarga(m.desde)}. Sigue hasta que se elija este puesto.</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="el-bloque" aria-labelledby="obs-titulo">
              <h2 id="obs-titulo" className="el-h2">Observadores</h2>
              <p className="el-nota mb-3">Vigilan que todo se haga según las reglas. No ocupan otro cargo.</p>
              {v.observadores.length === 0 ? (
                <p className="el-nota">Todavía no hay observadores elegidos.</p>
              ) : (
                <ul className="el-observadores">
                  {v.observadores.map((o, i) => (
                    <li key={`${o.nombre}-${i}`}>
                      <Hexagono texto={o.iniciales} variante="claro" tamano={44} />
                      <span className="el-obs-nombre">{o.nombre}</span>
                      <span className="el-nota">hasta el {fechaLarga(o.hasta)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="el-bloque" aria-labelledby="coord-titulo">
              <h2 id="coord-titulo" className="el-h2">Coordinación de cada comunidad</h2>
              <p className="el-nota mb-3">Cada comunidad activa elige a 2 personas que la organizan.</p>
              <ul className="el-comunidades">
                {v.comunidades.map((c) => (
                  <li key={c.id} className="el-comunidad">
                    <p className="font-medium">{c.nombre}</p>
                    {c.coordinadores.length > 0 ? (
                      <ul className="el-coords">
                        {c.coordinadores.map((p, i) => (
                          <li key={`${p.nombre}-${i}`}>
                            <Hexagono texto={p.iniciales} variante="claro" tamano={36} />
                            <span>
                              {p.nombre}
                              {p.enFunciones && <span className="el-insignia el-insignia-azul">En funciones</span>}
                              <span className="el-nota" style={{ display: 'block' }}>hasta el {fechaLarga(p.hasta)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="el-nota">
                        {!c.activa
                          ? 'Todavía no está activa: hace falta que se junten más personas.'
                          : c.eleccionAbierta
                            ? 'Está eligiendo a quienes la coordinan.'
                            : 'Todavía no tiene coordinación elegida.'}
                      </p>
                    )}
                    {c.coordinadores.length > 0 && c.eleccionAbierta && (
                      <p className="el-nota">Hay una elección abierta.</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="el-nota mt-3">“Exilio y diáspora” la organiza la mesa.</p>
            </section>

            <aside className="el-aviso" aria-labelledby="revocar-titulo">
              <h2 id="revocar-titulo" className="el-h2">¿Y si alguien no cumple?</h2>
              <p>
                La comunidad podrá pedir que una persona deje su cargo antes de tiempo. <strong>Próximamente.</strong>
              </p>
            </aside>
          </>
        )}
      </main>

      <footer className="ln-footer">
        <div className="ln-container ln-footer-inner">
          <span className="ln-brand ln-brand--light">Decide <em>Nicaragua</em></span>
          <div className="ln-footer-links">
            <Link href="/" className="ln-footer-link">Inicio</Link>
            <Link href="/explore" className="ln-footer-link">Modo observador</Link>
            <Link href="/login" className="ln-footer-link">Registrarme</Link>
          </div>
          <span className="ln-footer-copy">Código abierto · Auditable · Sin ánimo de lucro</span>
        </div>
      </footer>
    </div>
  );
}
