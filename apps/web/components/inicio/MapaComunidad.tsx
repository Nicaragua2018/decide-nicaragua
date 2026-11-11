import Link from 'next/link';
import { serverFetch } from '@/lib/api';
import { agruparGrupos } from '@/lib/inicio';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';
import type { GroupDetail, GroupSummary } from '@decide/shared';

async function miembrosDe(id: string): Promise<number | null> {
  try {
    const res = await serverFetch(`/api/groups/${id}`);
    return res.ok ? ((await res.json()) as GroupDetail).memberCount : null;
  } catch {
    return null;
  }
}

function Fila({ g, n }: { g: GroupSummary; n: number | null }) {
  return (
    <li>
      <Link href={`/groups/${g.id}`} className="fila-mapa">
        <Sacuanjoche variante={n !== null && n > 0 ? 'icono' : 'contorno'} tamano={22} />
        <span className="fila-mapa-nombre">{g.name}</span>
        {n !== null && <span className="fila-mapa-n">{n === 1 ? '1 miembro' : `${n} miembros`}</span>}
      </Link>
    </li>
  );
}

/** `groups` es null cuando /api/groups falló: se avisa del fallo en vez de decir que no hay comunidades. */
export default async function MapaComunidad({ groups }: { groups: GroupSummary[] | null }) {
  const { origen, acogida, otras } = agruparGrupos(groups ?? []);
  const territoriales = [...origen, ...acogida];
  const conteos = await Promise.all(territoriales.map((g) => miembrosDe(g.id)));
  const n = new Map(territoriales.map((g, i) => [g.id, conteos[i] ?? null]));

  const columna = (titulo: string, lista: GroupSummary[]) => (
    <div className="mapa-columna">
      <h3 className="mapa-subtitulo">{titulo}</h3>
      <ul className="mapa-lista">
        {lista.map((g) => (
          <Fila key={g.id} g={g} n={n.get(g.id) ?? null} />
        ))}
      </ul>
    </div>
  );

  return (
    <section id="mapa" className="card mapa" aria-labelledby="mapa-titulo">
      <h2 id="mapa-titulo" className="inicio-h2">El mapa de la comunidad</h2>
      {groups === null ? (
        <p className="mapa-vacio">No se pudieron cargar tus comunidades. Intenta de nuevo en un momento.</p>
      ) : groups.length === 0 ? (
        <div className="mapa-vacio-bloque">
          <p className="mapa-vacio">Aún no tienes comunidades asignadas</p>
          <Link href="/me" className="btn btn-primary">
            Completar mi perfil
          </Link>
        </div>
      ) : (
        <div className="mapa-columnas">
          {columna('Territorio de origen', origen)}
          {columna('Lugar de acogida', acogida)}
        </div>
      )}
      {otras.length > 0 && (
        <div className="mapa-otras">
          <h3 className="mapa-subtitulo">Mis comunidades</h3>
          <ul className="mapa-lista">
            {otras.map((g) => (
              <Fila key={g.id} g={g} n={null} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
