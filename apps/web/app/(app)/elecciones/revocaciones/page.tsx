import Link from 'next/link';
import type { Metadata } from 'next';
import { CARGO_ETIQUETA, type MiCargoVista, type RepresentantesVista, type RevocacionVista, type RuleView } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { fechaLarga } from '@/components/elecciones/textos';
import { ApoyoBoton } from './ApoyoBoton';
import { PedirRevocacionForm, type CargoPedible } from './PedirRevocacionForm';

export const metadata: Metadata = { title: 'Pedir la revocación de un cargo — Decide Nicaragua' };
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function leerRepresentantes(): Promise<RepresentantesVista | null> {
  try {
    const res = await fetch(`${API_URL}/api/representantes`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as RepresentantesVista) : null;
  } catch {
    return null;
  }
}

/** La fracción sale de la regla `revocacion.fraccion`; si no se puede leer, el texto dice «un tercio». */
async function leerFraccion(): Promise<string> {
  try {
    const res = await serverFetch('/api/public/reglas');
    if (res.ok) {
      const regla = ((await res.json()) as RuleView[]).find((r) => r.key === 'revocacion.fraccion');
      if (regla && /^\d+$/.test(regla.value)) return `el ${regla.value} %`;
    }
  } catch {
    // se usa el texto de reserva
  }
  return 'un tercio';
}

export default async function RevocacionesPage() {
  const [revRes, misRes, rep, fraccion] = await Promise.all([
    serverFetch('/api/elecciones/revocaciones'),
    serverFetch('/api/elecciones/mis-cargos'),
    leerRepresentantes(),
    leerFraccion(),
  ]);
  const abiertas = revRes.ok ? ((await revRes.json()) as RevocacionVista[]) : null;
  const mios = misRes.ok ? ((await misRes.json()) as MiCargoVista[]) : [];

  const propios = new Set(mios.map((c) => c.id));
  const conPedido = new Set<string | null>([
    ...(abiertas ?? []).map((r) => r.cargoId),
    ...(rep
      ? [
          ...rep.mesa.filter((m) => m.revocacion).map((m) => m.cargoId),
          ...rep.observadores.filter((o) => o.revocacion).map((o) => o.cargoId),
          ...rep.comunidades.flatMap((c) => c.coordinadores.filter((p) => p.revocacion).map((p) => p.cargoId)),
        ]
      : []),
  ]);
  const todos: { cargoId: string | null; tipo: CargoPedible['tipo']; nombre: string; comunidad: string | null }[] = rep
    ? [
        ...rep.mesa.map((m) => ({ cargoId: m.cargoId, tipo: m.tipo, nombre: m.nombre, comunidad: null })),
        ...rep.observadores.map((o) => ({ cargoId: o.cargoId, tipo: 'observador' as const, nombre: o.nombre, comunidad: null })),
        ...rep.comunidades.flatMap((c) =>
          c.coordinadores.map((p) => ({ cargoId: p.cargoId, tipo: 'coordinador' as const, nombre: p.nombre, comunidad: c.nombre })),
        ),
      ]
    : [];
  const cargos: CargoPedible[] = [];
  for (const c of todos) {
    if (c.cargoId !== null && !propios.has(c.cargoId) && !conPedido.has(c.cargoId)) {
      cargos.push({ ...c, cargoId: c.cargoId });
    }
  }

  return (
    <div className="el-pagina">
      <div className="page-header">
        <h1 className="page-title">Pedir la revocación de un cargo</h1>
        <p className="page-sub">
          Si {fraccion} de quienes votan por un cargo lo pide, se repite
          la elección de ese cargo. Nadie ve quién apoyó.
        </p>
      </div>

      <section className="el-bloque" aria-labelledby="abiertos-titulo">
        <h2 id="abiertos-titulo" className="el-h2">Pedidos abiertos</h2>
        {abiertas === null ? (
          <p className="alert alert-error">No se pudieron cargar los pedidos. Prueba de nuevo en un rato.</p>
        ) : abiertas.length === 0 ? (
          <p className="el-nota">Ahora no hay pedidos abiertos.</p>
        ) : (
          <ul className="el-lista" style={{ listStyle: 'none', padding: 0 }}>
            {abiertas.map((r) => {
              const pct = r.umbral > 0 ? Math.min(100, Math.round((r.apoyos / r.umbral) * 100)) : 0;
              return (
                <li key={r.id} className="el-tarjeta">
                  <p className="el-etiqueta">{CARGO_ETIQUETA[r.tipo]}{r.comunidad ? ` · ${r.comunidad}` : ''}</p>
                  <h3 className="el-tarjeta-titulo">{r.persona}</h3>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{r.motivo}</p>
                  <div className="el-mandato">
                    <div
                      className="el-mandato-pista"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={r.umbral}
                      aria-valuenow={Math.min(r.apoyos, r.umbral)}
                      aria-label="Apoyos reunidos"
                    >
                      <span className="el-mandato-barra" style={{ width: `${pct}%`, background: '#F2B00A' }} />
                    </div>
                    <p className="el-nota">{r.apoyos} de {r.umbral} apoyos · cierra el {fechaLarga(r.venceAt)}</p>
                  </div>
                  {r.puedoApoyar ? (
                    <ApoyoBoton id={r.id} apoyaste={r.apoyaste} />
                  ) : (
                    <p className="el-nota">Solo pueden apoyar quienes votan por este cargo.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="el-bloque" aria-labelledby="pedir-titulo">
        <h2 id="pedir-titulo" className="el-h2">Pedir una revocación</h2>
        {rep === null ? (
          <p className="alert alert-error">No se pudo cargar la lista de cargos. Prueba de nuevo en un rato.</p>
        ) : (
          <PedirRevocacionForm cargos={cargos} />
        )}
      </section>

      <p className="mt-4">
        <Link href="/representantes">Quiénes nos representan</Link>
      </p>
    </div>
  );
}
