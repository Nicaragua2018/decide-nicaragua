import Link from 'next/link';
import type { GroupSummary } from '@decide/shared';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';

/** Una píldora por comunidad. Solo se conoce el número de la comunidad elegida; las demás lo omiten. */
export function PestanasComunidad({
  groups,
  selectedId,
  conteos,
}: {
  groups: GroupSummary[];
  selectedId: string;
  conteos: Record<string, number | undefined>;
}) {
  return (
    <div role="tablist" aria-label="Comunidad" className="inq-pestanas">
      {groups.map((g) => {
        const activa = g.id === selectedId;
        const n = conteos[g.id];
        return (
          <Link
            key={g.id}
            href={`/inquietudes?groupId=${g.id}`}
            role="tab"
            aria-selected={activa}
            className={activa ? 'inq-pestana inq-pestana-activa' : 'inq-pestana'}
          >
            <Sacuanjoche
              variante="icono"
              tamano={12}
              color={activa ? '#f2b00a' : '#0a3880'}
              centro={activa ? '#ffffff' : '#f2b00a'}
            />
            {g.name}
            {n !== undefined && <span className="inq-pestana-n">{n}</span>}
          </Link>
        );
      })}
    </div>
  );
}
