import Link from 'next/link';
import type { InquietudSummary } from '@decide/shared';
import { MarcaAsistente } from '@/components/SugerenciaAsistente';
import { SupportButton } from './SupportButton';
import { INQUIETUD_STATUS_BADGE, INQUIETUD_STATUS_LABEL, formatDate } from './status';

export function TarjetaInquietud({ q }: { q: InquietudSummary }) {
  return (
    <article className="card card-enlace inq-tarjeta">
      {!q.hidden && <SupportButton id={q.id} supported={q.supportedByMe} count={q.supportCount} />}
      <div className="inq-cuerpo">
        <Link href={`/inquietudes/${q.id}`} className="inq-titulo">
          {q.hidden ? 'Inquietud oculta por la moderación' : q.title}
        </Link>
        <p className="inq-etiquetas">
          <span className={`badge ${INQUIETUD_STATUS_BADGE[q.status]}`}>{INQUIETUD_STATUS_LABEL[q.status]}</span>
          {!q.hidden && q.origen === 'asistente' && <MarcaAsistente />}
        </p>
        <p className="card-meta">
          {q.supportCount} apoyos de {q.threshold} necesarios
        </p>
        {q.status === 'en_plazo' && q.deadlineAt && (
          <p className="card-meta">Plazo para responder: {formatDate(q.deadlineAt)}</p>
        )}
      </div>
    </article>
  );
}
