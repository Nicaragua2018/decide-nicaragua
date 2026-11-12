import Link from 'next/link';
import { leerDecisionesPublicas } from './decisiones';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';
import s from './secciones.module.css';

const formatoFecha = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Managua',
});

export async function LoQueDecidimos() {
  const decisiones = await leerDecisionesPublicas();

  return (
    <section className={s.seccion} aria-labelledby="decidimos-titulo">
      <div className={s.interior}>
        <h2 id="decidimos-titulo" className={s.titulo}>
          Lo que ya decidimos
        </h2>
        <p className={s.entrada}>Últimos acuerdos del espacio general «Exilio y diáspora».</p>

        {decisiones.length === 0 ? (
          <div className={s.vacio}>
            <Sacuanjoche variante="icono" tamano={20} />
            <p>Aquí verás los primeros acuerdos de la comunidad</p>
          </div>
        ) : (
          <ul className={s.tarjetas}>
            {decisiones.map((d) => (
              <li key={`${d.fecha}-${d.title}`} className={s.tarjeta}>
                <span
                  className={`${s.estado} ${d.estado === 'aprobada' ? s.estadoAprobada : s.estadoRechazada}`}
                >
                  {d.estado === 'aprobada' ? <IconoAprobada /> : <IconoRechazada />}
                  {d.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                </span>
                <h3 className={s.tarjetaTitulo}>{d.title}</h3>
                <time className={s.tarjetaFecha} dateTime={d.fecha}>
                  {formatoFecha.format(new Date(d.fecha))}
                </time>
              </li>
            ))}
          </ul>
        )}

        <div className={s.enlaces}>
          <Link href="/explore" className={s.botonSecundario}>
            Cómo funciona
          </Link>
          <Link href="/representantes" className={s.botonSecundario}>
            Quiénes nos representan
          </Link>
        </div>
      </div>
    </section>
  );
}

const icono = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

function IconoAprobada() {
  return (
    <svg {...icono}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function IconoRechazada() {
  return (
    <svg {...icono}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
