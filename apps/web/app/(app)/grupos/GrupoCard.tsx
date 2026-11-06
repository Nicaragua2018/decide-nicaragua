import Link from 'next/link';
import type { GrupoTrabajoItem } from '@decide/shared';
import { EntrarSalir } from './[id]/EntrarSalir';

const ESTADO_LABEL: Record<GrupoTrabajoItem['estado'], string> = {
  convocando: 'Convocando',
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
  archivado: 'Archivado',
};

export function estadoGrupo(g: GrupoTrabajoItem): string {
  return ESTADO_LABEL[g.estado];
}

/** Línea de estado: «Se forma con {mínimo}: faltan {n} · hasta el {fecha}» o «{n} miembros». */
export function lineaGrupo(g: GrupoTrabajoItem): string {
  if (g.estado === 'convocando') {
    const faltan = g.faltan ?? 0;
    const hasta = g.convocatoriaEndsAt ? ` · hasta el ${new Date(g.convocatoriaEndsAt).toLocaleDateString('es-NI')}` : '';
    return `Se forma con ${g.miembros + faltan}: faltan ${faltan}${hasta}`;
  }
  return `${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'}`;
}

export function GrupoCard({ g }: { g: GrupoTrabajoItem }) {
  const puedeUnirse = !g.soyMiembro && (g.estado === 'convocando' || g.estado === 'activo');
  return (
    <li className="mt-3">
      <Link href={`/grupos/${g.id}`}>
        <span className="group-card-name">{g.name}</span>
      </Link>
      <p className="card-meta">{g.proposito}</p>
      <p className="card-meta">
        <span className="badge badge-open">{estadoGrupo(g)}</span> {lineaGrupo(g)}
      </p>
      {g.soyMiembro ? (
        <p className="card-meta"><strong>Ya eres parte</strong></p>
      ) : (
        puedeUnirse && <EntrarSalir grupoId={g.id} accion="entrar" />
      )}
    </li>
  );
}
