import { serverFetch } from '@/lib/api';
import AlDiaCard from '@/components/AlDiaCard';
import type { AlDiaView } from '@decide/shared';

/** Se carga aparte (dentro de Suspense) para que la IA no demore el resto del panel. */
export default async function AlDiaSeccion() {
  const res = await serverFetch('/api/asistente/al-dia').catch(() => null);
  const alDia = res?.ok ? ((await res.json()) as AlDiaView) : null;
  if (!alDia?.mostrar) return null;
  return <AlDiaCard resumen={alDia.resumen} items={alDia.items} />;
}
