import { serverFetch } from '@/lib/api';
import CrecerCard from '@/components/CrecerCard';
import type { CrecerView } from '@decide/shared';

/** Se carga aparte (dentro de Suspense) para que la IA no demore el resto de la página. */
export default async function CrecerSeccion({ groupId }: { groupId: string }) {
  const res = await serverFetch(`/api/asistente/crecer/${groupId}`).catch(() => null);
  const crecer = res?.ok ? ((await res.json()) as CrecerView) : null;
  if (!crecer?.mostrar) return null;
  return (
    <CrecerCard
      groupId={groupId}
      activa={crecer.activa}
      faltan={crecer.faltan}
      texto={crecer.texto}
      mensajeInvitacion={crecer.mensajeInvitacion}
      deAsistente={crecer.deAsistente}
    />
  );
}
