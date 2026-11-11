import { serverFetch } from '@/lib/api';
import AlDiaCard from '@/components/AlDiaCard';
import CrecerSeccion from '@/components/CrecerSeccion';
import { Guardian } from '@/components/guardian/Guardian';
import type { AlDiaView } from '@decide/shared';

/** Se carga aparte (dentro de Suspense) para que la IA no demore el resto de Inicio. */
export default async function TarjetaGuardian({ groupId }: { groupId?: string | undefined }) {
  let alDia: AlDiaView | null = null;
  try {
    const res = await serverFetch('/api/asistente/al-dia');
    alDia = res.ok ? ((await res.json()) as AlDiaView) : null;
  } catch {
    alDia = null;
  }
  return (
    <>
      {alDia?.mostrar ? (
        <AlDiaCard resumen={alDia.resumen} items={alDia.items} />
      ) : (
        <section className="card al-dia" aria-labelledby="al-dia-titulo">
          <h2 id="al-dia-titulo" className="card-title al-dia-titulo">
            <Guardian tamano={32} />
            Desde tu última visita
          </h2>
          <p className="al-dia-vacio-texto">Todavía no hay novedades. Cuando la comunidad se mueva, te lo cuento aquí.</p>
        </section>
      )}
      {groupId && <CrecerSeccion groupId={groupId} />}
    </>
  );
}
