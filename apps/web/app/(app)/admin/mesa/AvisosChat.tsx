import type { ChatAvisoMesa } from '@decide/shared';
import { ModerarForm } from '@/components/ModerarForm';

/** Mensajes de chat de los que avisó algún miembro. Sin nombres: la mesa juzga el texto. */
export function AvisosChat({ avisos }: { avisos: ChatAvisoMesa[] }) {
  if (avisos.length === 0) return <p className="empty-state">No hay avisos del chat.</p>;

  return (
    <>
      {avisos.map((a) => (
        <div key={a.id} className="card">
          <p className="card-title">Mensaje de chat · {a.comunidad}</p>
          <p className="card-meta">
            {a.avisos === 1 ? '1 aviso' : `${a.avisos.toString()} avisos`} ·{' '}
            {new Date(a.createdAt).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <blockquote className="card" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {a.texto}
          </blockquote>
          <ModerarForm target="mensaje" targetId={a.id} colapsable />
        </div>
      ))}
    </>
  );
}
