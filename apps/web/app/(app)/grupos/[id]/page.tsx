import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { GrupoTrabajoDetail } from '@decide/shared';
import { estadoGrupo, lineaGrupo } from '../GrupoCard';
import { EntrarSalir } from './EntrarSalir';

export const metadata: Metadata = { title: 'Grupo de trabajo — Decide Nicaragua' };

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await serverFetch(`/api/grupos/${id}`);
  if (!res.ok) return <p className="empty-state">Grupo no encontrado.</p>;
  const g = (await res.json()) as GrupoTrabajoDetail;

  return (
    <>
      <div className="page-header">
        <Link href="/grupos" className="text-sm text-muted">← Grupos de trabajo</Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="page-title">{g.name}</h1>
          <span className="badge badge-open">{estadoGrupo(g)}</span>
        </div>
        <p className="card-meta">{g.ambito.name} · {lineaGrupo(g)}</p>
      </div>

      {!g.soyMiembro && (
        <p className="alert alert-warning mb-4">Puedes leer todo; para participar, únete al grupo</p>
      )}

      <div className="card mb-4">
        <p className="card-title">Propósito</p>
        <p className="mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{g.proposito}</p>
      </div>

      <div className="card mb-4">
        <p className="card-title">Miembros ({g.miembros})</p>
        {g.miembrosNombres.length > 0 && (
          <ul className="mt-2">
            {g.miembrosNombres.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {g.puedoEntrar && <EntrarSalir grupoId={g.id} accion="entrar" small={false} />}
        {g.puedoSalir && <EntrarSalir grupoId={g.id} accion="salir" small={false} />}
        {g.estado === 'activo' && g.forumId && (
          <Link href={`/foros/${g.forumId}`} className="btn btn-primary">Ir al foro del grupo</Link>
        )}
      </div>
    </>
  );
}
