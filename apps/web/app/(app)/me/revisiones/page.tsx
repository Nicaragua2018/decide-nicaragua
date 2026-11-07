import type { Metadata } from 'next';
import Link from 'next/link';
import { MODERACION_CAUSAS } from '@decide/shared';
import type { EstadoTextoEnRevision, TextoEnRevisionView } from '@decide/shared';
import { serverFetch } from '@/lib/api';

export const metadata: Metadata = { title: 'Mis textos en revisión' };

function estadoEnPalabras(r: TextoEnRevisionView): string {
  const estados: Record<EstadoTextoEnRevision, string> = {
    pendiente: 'En revisión',
    publicado: 'Publicado',
    rechazado: 'Rechazado',
    vencido: 'Venció sin revisión: puedes reformularlo',
    no_publicable: `No se pudo publicar: ${r.motivo ?? 'ya no era posible'}`,
  };
  return estados[r.estado];
}

export default async function MisRevisionesPage() {
  const res = await serverFetch('/api/asistente/revisiones/mias');
  const items = res.ok ? ((await res.json()) as TextoEnRevisionView[]) : [];

  return (
    <>
      <div className="page-header">
        <Link href="/me" className="text-sm text-muted">← Mi perfil</Link>
        <h1 className="page-title mt-2">Mis textos en revisión</h1>
        <p className="page-sub">Textos que pediste que la mesa revise antes de publicarse.</p>
      </div>

      {items.length === 0 && <p className="empty-state">No tienes textos en revisión.</p>}
      {items.map((r) => (
        <div key={r.id} className="card">
          <p className="card-title">{estadoEnPalabras(r)}</p>
          <blockquote style={{ whiteSpace: 'pre-wrap' }}>{r.texto}</blockquote>
          <p className="card-meta">
            Causa: {MODERACION_CAUSAS.find((c) => c.value === r.causa)?.label ?? r.causa}
          </p>
          <p className="card-meta">
            Fecha límite: {new Date(r.venceAt).toLocaleDateString('es-NI')}
          </p>
        </div>
      ))}
    </>
  );
}
