import { leerSugerencia } from '@/lib/api';
import { SugerenciaAsistente } from '@/components/SugerenciaAsistente';
import { BorradoresSolucion } from '@/app/(app)/proposals/[id]/BorradoresSolucion';
import { NuevaSolucionForm } from '@/app/(app)/proposals/[id]/NuevaSolucionForm';

/* Cada sección carga su sugerencia aparte (dentro de Suspense) y, sin sugerencia, no muestra nada. */

export async function UmbralSeccion({ inquietudId }: { inquietudId: string }) {
  const s = await leerSugerencia('umbral', inquietudId);
  if (s?.tipo !== 'umbral') return null;
  return (
    <SugerenciaAsistente titulo="Resumen y borrador de respuesta" base={s.base}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{s.contenido.resumen}</p>
      <p className="text-sm font-medium mt-2">Borrador de respuesta</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{s.contenido.borradorRespuesta}</p>
    </SugerenciaAsistente>
  );
}

export async function MapaAsistenteSeccion({ proposalId }: { proposalId: string }) {
  const s = await leerSugerencia('mapa', proposalId);
  if (s?.tipo !== 'mapa') return null;
  const { resumen, grupos, puentes } = s.contenido;
  return (
    <SugerenciaAsistente titulo="Qué piensa cada grupo" base={s.base}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{resumen}</p>
      {grupos.map((g, i) => (
        <div key={i} className="sugerencia-asistente-grupo">
          <p className="font-medium">
            {g.nombre} <small className="text-muted">· unas {g.tamano} personas</small>
          </p>
          <p className="text-sm">{g.piensa}</p>
          {g.citas.map((c, j) => (
            <blockquote key={j}>«{c}»</blockquote>
          ))}
        </div>
      ))}
      {puentes.texto && (
        <div className="sugerencia-asistente-grupo">
          <p className="font-medium">Frases en las que coinciden</p>
          <p className="text-sm">{puentes.texto}</p>
          {puentes.citas.map((c, j) => (
            <blockquote key={j}>«{c}»</blockquote>
          ))}
        </div>
      )}
    </SugerenciaAsistente>
  );
}

export async function ComisionSeccion({ grupoId }: { grupoId: string }) {
  const s = await leerSugerencia('comision', grupoId);
  if (s?.tipo !== 'comision') return null;
  return (
    <SugerenciaAsistente titulo="Qué pide esta tarea" base={s.base}>
      {s.contenido.capacidades.length > 0 && (
        <ul className="mt-2" style={{ marginLeft: '1.25rem' }}>
          {s.contenido.capacidades.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      <p className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>{s.contenido.comentario}</p>
    </SugerenciaAsistente>
  );
}

/** Formulario de nueva solución; si hay borradores del asistente, los ofrece arriba. */
export async function NuevaSolucionConBorradores({ proposalId }: { proposalId: string }) {
  const s = await leerSugerencia('borradores', proposalId);
  if (s?.tipo !== 'borradores' || s.contenido.borradores.length === 0) {
    return <NuevaSolucionForm proposalId={proposalId} />;
  }
  return <BorradoresSolucion proposalId={proposalId} borradores={s.contenido.borradores} base={s.base} />;
}
