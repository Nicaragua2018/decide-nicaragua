import type { ReactNode } from 'react';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';

const PETALOS = [0, 72, 144, 216, 288];
const PETALO = 'M0 0C-2.6-1.7-4-5-2.9-7.8C-2.1-10 .9-10.5 2.3-8.6C3.9-6.4 2.6-2.5 0 0Z';

/** Sacuanjoche tenue. La animación va en el <g> interior; el exterior lleva la escala. */
function Flor({ x, y, escala, clase, color }: { x: number; y: number; escala: number; clase: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <g className={clase} fill={color}>
        {PETALOS.map((a) => (
          <path key={a} d={PETALO} transform={`rotate(${a})`} />
        ))}
      </g>
    </g>
  );
}

function fraseDelMomento(preguntas: number | null): string {
  if (preguntas === null) return 'Esta es la mesa de tu comunidad.';
  if (preguntas === 0) return 'Todavía no hay preguntas abiertas: plantea la primera.';
  if (preguntas === 1) return 'La comunidad ya tiene su primera pregunta.';
  if (preguntas <= 20) return `La comunidad ya tiene sus primeras ${preguntas} preguntas.`;
  return `La comunidad tiene ${preguntas} preguntas abiertas.`;
}

export default function Bienvenida({
  nombre,
  comunidad,
  preguntas,
  children,
}: {
  nombre: string | null;
  comunidad: string | null;
  preguntas: number | null;
  /** Las cifras. */
  children?: ReactNode;
}) {
  return (
    <section className="inicio-hero" aria-labelledby="inicio-titulo">
      <svg className="inicio-hero-flores" aria-hidden="true" width="520" height="360" viewBox="0 0 520 360">
        <Flor x={300} y={136} escala={11} clase="flor-float" color="#0a3880" />
        <Flor x={440} y={230} escala={7.5} clase="flor-float-2" color="#f2b00a" />
        <Flor x={120} y={278} escala={5.5} clase="flor-float" color="#0a3880" />
      </svg>
      <div className="inicio-hero-texto">
        {comunidad && (
          <span className="inicio-etiqueta fade-up d1">
            <Sacuanjoche variante="icono" tamano={12} />
            {comunidad}
          </span>
        )}
        <h1 id="inicio-titulo" className="inicio-h1 fade-up d2">
          {nombre ? `Hola, ${nombre}. ` : 'Hola. '}
          {fraseDelMomento(preguntas)}
        </h1>
        <p className="inicio-lead fade-up d3">
          Aquí nos organizamos, debatimos y decidimos en comunidad. Invita a las primeras personas, apoya las
          preguntas que importan y abre el camino hacia la primera elección.
        </p>
      </div>
      {children}
    </section>
  );
}
