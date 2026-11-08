import { leerSugerencia } from '@/lib/api';
import { SugerenciaAsistente } from '@/components/SugerenciaAsistente';
import { JuntarEnDebate } from './OpenDebateForm';

/** «Inquietudes parecidas» de una comunidad; solo cuenta las que siguen en la agenda. */
export async function InquietudesParecidas({ groupId, idsEnLista }: { groupId: string; idsEnLista: string[] }) {
  const s = await leerSugerencia('agrupar', groupId);
  if (s?.tipo !== 'agrupar') return null;
  const enLista = new Set(idsEnLista);
  const grupos = s.contenido.grupos
    .map((g) => ({ ...g, inquietudes: g.inquietudes.filter((q) => enLista.has(q.id)) }))
    .filter((g) => g.inquietudes.length >= 2);
  if (grupos.length === 0) return null;
  return (
    <SugerenciaAsistente titulo="Inquietudes parecidas" base={s.base}>
      {grupos.map((g, i) => (
        <div key={i} className="sugerencia-asistente-grupo">
          <p className="font-medium">{g.titulo}</p>
          <p className="text-sm">{g.descripcion}</p>
          <ul className="text-sm" style={{ marginLeft: '1.25rem' }}>
            {g.inquietudes.map((q) => <li key={q.id}>{q.title}</li>)}
          </ul>
          <JuntarEnDebate ids={g.inquietudes.map((q) => q.id)} title={g.titulo} body={g.descripcion} />
        </div>
      ))}
    </SugerenciaAsistente>
  );
}
