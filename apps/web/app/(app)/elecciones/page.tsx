import Link from 'next/link';
import type { Metadata } from 'next';
import type { EleccionResumen } from '@decide/shared';
import { serverFetch } from '@/lib/api';
import { LineaDeTiempo } from '@/components/elecciones/LineaDeTiempo';
import { cuentaAtras, puestosTexto, tituloEleccion } from '@/components/elecciones/textos';

export const metadata: Metadata = { title: 'Elecciones — Decide Nicaragua' };

const MOTIVO: Record<EleccionResumen['motivo'], string> = {
  primera: 'Primera elección',
  renovacion: 'Renovación',
  reintento: 'Se repite: quedó un puesto sin elegir',
};

/** El único botón con la acción del momento. */
function Accion({ e }: { e: EleccionResumen }) {
  const href = `/elecciones/${e.id}`;
  if (e.fase === 'candidaturas') {
    return e.puedoPresentarme ? (
      <Link href={`${href}#presentarme`} className="el-btn el-btn-primario">Presentarme</Link>
    ) : (
      <Link href={href} className="el-btn el-btn-primario">Ver las candidaturas</Link>
    );
  }
  if (e.fase === 'votacion') {
    return (
      <Link href={`${href}#papeleta-titulo`} className="el-btn el-btn-primario">
        {e.yaVote ? 'Cambiar mi voto' : 'Votar'}
      </Link>
    );
  }
  return <Link href={href} className="el-btn el-btn-primario">Ver resultado</Link>;
}

function Tarjeta({ e, ahora }: { e: EleccionResumen; ahora: number }) {
  const cuenta = cuentaAtras(e, ahora);
  return (
    <article className="el-tarjeta">
      <p className="el-etiqueta">{MOTIVO[e.motivo]} · {puestosTexto(e.puestos)}</p>
      <h2 className="el-tarjeta-titulo">
        <Link href={`/elecciones/${e.id}`}>{tituloEleccion(e)}</Link>
      </h2>
      <LineaDeTiempo fase={e.fase} candidaturasEndsAt={e.candidaturasEndsAt} votacionEndsAt={e.votacionEndsAt} />
      {cuenta && <p className="el-cuenta">{cuenta}</p>}
      {e.fase === 'votacion' && e.participacionAprox !== null && (
        <p className="el-nota">
          {e.participacionAprox === 0 ? 'Todavía nadie ha votado.' : `Ya votaron unas ${e.participacionAprox} personas.`}
          {e.yaVote && ' Tu voto ya está guardado.'}
        </p>
      )}
      <Accion e={e} />
    </article>
  );
}

export default async function EleccionesPage() {
  const res = await serverFetch('/api/elecciones');
  const lista = res.ok ? ((await res.json()) as EleccionResumen[]) : null;
  const ahora = Date.now();

  return (
    <div className="el-pagina">
      <div className="page-header">
        <h1 className="page-title">Elecciones</h1>
        <p className="page-sub">
          Aquí se elige a quienes nos representan. Puedes presentarte o votar en las elecciones de tus comunidades.
        </p>
      </div>

      {lista === null ? (
        <p className="alert alert-error">No se pudieron cargar las elecciones. Prueba de nuevo en un rato.</p>
      ) : lista.length === 0 ? (
        <p className="el-nota">Ahora no hay elecciones abiertas para ti.</p>
      ) : (
        <div className="el-lista">
          {lista.map((e) => (
            <Tarjeta key={e.id} e={e} ahora={ahora} />
          ))}
        </div>
      )}

      <p className="mt-4">
        <Link href="/representantes">Quiénes nos representan</Link>
      </p>
    </div>
  );
}
