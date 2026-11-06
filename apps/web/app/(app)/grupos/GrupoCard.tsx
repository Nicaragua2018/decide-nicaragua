import Link from 'next/link';
import type { GrupoTrabajoItem } from '@decide/shared';
import { EntrarSalir } from './[id]/EntrarSalir';
import { PausarForm } from './[id]/BifurcacionForms';

const ESTADO_LABEL: Record<GrupoTrabajoItem['estado'], string> = {
  convocando: 'Convocando',
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
  archivado: 'Archivado',
  eligiendo: 'Eligiendo integrantes',
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI');
}

export function estadoGrupo(g: GrupoTrabajoItem): string {
  return ESTADO_LABEL[g.estado];
}

/**
 * Línea de estado: «Se forma con {mínimo}: faltan {n} · hasta el {fecha}», «Convocando voluntarios
 * · hasta el {fecha}» (una comisión no se forma por número de miembros) o «{n} miembros».
 */
export function lineaGrupo(g: GrupoTrabajoItem): string {
  if (g.estado === 'convocando') {
    const hasta = g.convocatoriaEndsAt ? ` · hasta el ${fecha(g.convocatoriaEndsAt)}` : '';
    if (g.tipo === 'comision') return `Convocando voluntarios${hasta}`;
    const faltan = g.faltan ?? 0;
    return `Se forma con ${g.miembros + faltan}: faltan ${faltan}${hasta}`;
  }
  // Una iniciativa de un grupo nunca muestra nombres: solo cuántas personas son.
  if (g.tipo === 'bifurcacion') return `Iniciativa de un grupo · ${g.miembros} ${g.miembros === 1 ? 'persona' : 'personas'}`;
  return `${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'}`;
}

/** Último informe de una comisión, recortado para las listas. */
export function UltimoInforme({ g }: { g: GrupoTrabajoItem }) {
  if (!g.ultimoInforme) return null;
  const texto = g.ultimoInforme.texto.length > 200 ? `${g.ultimoInforme.texto.slice(0, 200)}…` : g.ultimoInforme.texto;
  return (
    <p className="card-meta">
      Último informe ({fecha(g.ultimoInforme.createdAt)}): {texto}
    </p>
  );
}

export function GrupoCard({ g }: { g: GrupoTrabajoItem }) {
  // Solo a un subgrupo se entra desde aquí: a una comisión se llega como voluntario y a una
  // iniciativa de un grupo, desde el resultado de la decisión (solo quien apoyó la solución).
  const puedeUnirse = g.tipo === 'subgrupo' && !g.soyMiembro && (g.estado === 'convocando' || g.estado === 'activo');
  return (
    <li className="mt-3">
      <Link href={`/grupos/${g.id}`}>
        <span className="group-card-name">{g.name}</span>
      </Link>
      <p className="card-meta">{g.proposito}</p>
      <p className="card-meta">
        <span className="badge badge-open">{estadoGrupo(g)}</span> {lineaGrupo(g)}
      </p>
      <UltimoInforme g={g} />
      {g.soyMiembro ? (
        <p className="card-meta"><strong>Ya eres parte</strong></p>
      ) : (
        puedeUnirse && <EntrarSalir grupoId={g.id} accion="entrar" />
      )}
      {/* Quien organiza la comunidad pausa desde aquí, sin ver nada de dentro de la iniciativa. */}
      {g.puedoPausar && <PausarForm grupoId={g.id} />}
    </li>
  );
}
