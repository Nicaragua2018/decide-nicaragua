import type { EleccionFaseValue } from '@decide/shared';
import { Hexagono } from './Hexagono';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-NI', { day: 'numeric', month: 'short' });
}

/** Los 4 pasos de una elección: los pasados en azul con ✓, el actual en dorado y el futuro punteado. */
export function LineaDeTiempo({
  fase,
  candidaturasEndsAt,
  votacionEndsAt,
}: {
  fase: EleccionFaseValue;
  candidaturasEndsAt: string;
  votacionEndsAt: string;
}) {
  const actual = fase === 'candidaturas' ? 1 : fase === 'votacion' ? 2 : 3;
  const pasos = [
    { titulo: 'Convocatoria', detalle: 'Se abrió la elección' },
    { titulo: 'Candidaturas', detalle: `Hasta el ${fecha(candidaturasEndsAt)}` },
    { titulo: 'Votación', detalle: `Hasta el ${fecha(votacionEndsAt)}` },
    { titulo: 'Resultado', detalle: fase === 'contada' ? 'Ya está' : 'Al cerrar la votación' },
  ];
  return (
    <ol className="el-linea" aria-label="Pasos de la elección">
      {pasos.map((p, i) => {
        const estado = i < actual ? 'pasado' : i === actual ? 'actual' : 'futuro';
        const hecho = estado === 'pasado' || (estado === 'actual' && fase === 'contada');
        return (
          <li key={p.titulo} className={`el-paso el-paso-${estado}`} aria-current={estado === 'actual' ? 'step' : undefined}>
            <Hexagono
              texto={hecho ? '✓' : String(i + 1)}
              variante={hecho && estado === 'pasado' ? 'azul' : estado === 'actual' ? 'oro' : 'punteado'}
              tamano={40}
            />
            <span className="el-paso-titulo">{p.titulo}</span>
            <span className="el-paso-detalle">{p.detalle}</span>
            <span className="sr-only">
              {estado === 'pasado' ? ' (hecho)' : estado === 'actual' ? ' (ahora)' : ' (falta)'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
