import { serverFetch } from '@/lib/api';
import AlDiaCard from '@/components/AlDiaCard';
import CrecerSeccion from '@/components/CrecerSeccion';
import { Guardian } from '@/components/guardian/Guardian';
import type { AlDiaView } from '@decide/shared';

/** Se carga aparte (dentro de Suspense) para que la IA no demore el resto de Inicio. */
export default async function TarjetaGuardian({ groupId }: { groupId?: string | undefined }) {
  const res = await serverFetch('/api/asistente/al-dia').catch(() => null);
  const alDia = res?.ok ? ((await res.json()) as AlDiaView) : null;
  return (
    <>
      {alDia?.mostrar ? (
        <AlDiaCard resumen={alDia.resumen} items={alDia.items} />
      ) : (
        <section className="card al-dia al-dia-vacio">
          <Guardian tamano={32} />
          <p>Todavía no hay novedades. Cuando la comunidad se mueva, te lo cuento aquí.</p>
        </section>
      )}
      {groupId && <CrecerSeccion groupId={groupId} />}
    </>
  );
}
