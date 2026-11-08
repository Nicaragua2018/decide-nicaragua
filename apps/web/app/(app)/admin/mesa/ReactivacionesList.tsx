'use client';

import { useActionState } from 'react';
import type { ReactivacionPendiente } from '@decide/shared';
import { proposeBoardAction, type ActionResult } from '@/lib/actions';

function Pedido({ r }: { r: ReactivacionPendiente }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(proposeBoardAction, null);
  return (
    <div className="card">
      <p className="card-title">{r.nombre}</p>
      <p className="card-meta">Pidió el {new Date(r.createdAt).toLocaleDateString('es-NI')}</p>
      <p className="text-sm font-medium">Motivo de la suspensión</p>
      <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{r.motivoSuspension}</p>
      <p className="text-sm font-medium mt-2">Lo que cuenta la persona</p>
      <blockquote className="card" style={{ whiteSpace: 'pre-wrap' }}>{r.texto}</blockquote>
      <form action={action} className="form mt-2">
        <input type="hidden" name="targetUserId" value={r.userId} />
        <input type="hidden" name="solicitudId" value={r.id} />
        <input
          name="reason"
          className="form-input"
          placeholder="Tu motivo (se pide para rechazar y para reactivar)"
          required
          minLength={3}
          maxLength={500}
          aria-label="Motivo"
        />
        <div className="flex gap-2">
          <button type="submit" name="type" value="reactivate_user" className="btn btn-primary btn-sm" disabled={pending}>
            Proponer reactivar
          </button>
          <button type="submit" name="type" value="rechazar_reactivacion" className="btn btn-ghost btn-sm" disabled={pending}>
            Proponer rechazar
          </button>
        </div>
        {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
        {state && 'success' in state && (
          <p role="status" className="alert alert-success">Tu propuesta quedó en la lista de acciones. Falta otra firma.</p>
        )}
      </form>
    </div>
  );
}

export function ReactivacionesList({ items }: { items: ReactivacionPendiente[] }) {
  if (items.length === 0) return <p className="empty-state">No hay pedidos de reactivación.</p>;
  return (
    <>
      {items.map((r) => (
        <Pedido key={r.id} r={r} />
      ))}
    </>
  );
}
