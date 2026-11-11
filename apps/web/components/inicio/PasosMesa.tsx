import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';

const svgProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const FLECHA = (
  <svg
    className="arrow"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

type Paso = {
  n: 1 | 2 | 3 | 4;
  titulo: string;
  texto: string;
  enlace: string;
  href: string;
  icono: ReactNode;
};

export default function PasosMesa({ paso, puedeInvitar }: { paso: 1 | 2 | 3 | 4; puedeInvitar: boolean }) {
  const pasos: Paso[] = [
    {
      n: 1,
      titulo: 'Sumar a los primeros miembros',
      texto: 'Invita a quienes confías; cada persona verificada fortalece la comunidad.',
      enlace: 'Invitar',
      href: puedeInvitar ? '/admin/invite' : '/me',
      icono: (
        <svg {...svgProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      ),
    },
    {
      n: 2,
      titulo: 'Las primeras preguntas',
      texto: 'Apoya las que te importan; las más apoyadas se debaten.',
      enlace: 'Ver y apoyar',
      href: '/inquietudes',
      icono: (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r=".6" />
        </svg>
      ),
    },
    {
      n: 3,
      titulo: 'El camino a la elección',
      texto: 'Cuando la comunidad llegue al mínimo, se eligen coordinadores.',
      enlace: 'Preparar campaña',
      href: '/elecciones',
      icono: (
        <svg {...svgProps}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
      ),
    },
    {
      n: 4,
      titulo: 'El mapa de la comunidad',
      texto: 'Dónde están los miembros: origen y acogida.',
      enlace: 'Ver comunidades',
      href: '#mapa',
      icono: <Sacuanjoche variante="contorno" tamano={22} />,
    },
  ];

  return (
    <section className="inicio-pasos" aria-labelledby="pasos-titulo">
      <div className="inicio-seccion-cab">
        <h2 id="pasos-titulo" className="inicio-h2">Lo que toca ahora</h2>
        <span className="inicio-seccion-sub">Cuatro pasos para que la comunidad arranque</span>
      </div>
      <ol className="inicio-pasos-lista">
        {pasos.map((p) => {
          const activo = p.n === paso;
          return (
            <li key={p.n} className={`fade-up d${p.n + 1}`}>
              <Link
                href={p.href}
                className={`card card-enlace inicio-paso${activo ? ' paso-activo' : ''}`}
                aria-current={activo ? 'step' : undefined}
              >
                <span className="inicio-paso-icono">{p.icono}</span>
                <span className="inicio-paso-num">Paso {p.n}</span>
                <span className="inicio-paso-titulo">{p.titulo}</span>
                <span className="inicio-paso-texto">{p.texto}</span>
                <span className="inicio-paso-enlace">
                  {p.enlace} {FLECHA}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
