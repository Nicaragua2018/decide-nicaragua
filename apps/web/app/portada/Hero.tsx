import Link from 'next/link';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';
import { VideoColmena } from './VideoColmena';
import styles from './portada.module.css';

const PETALO = 'M0 0C-2.6-1.7-4-5-2.9-7.8C-2.1-10 .9-10.5 2.3-8.6C3.9-6.4 2.6-2.5 0 0Z';
const ANGULOS = [0, 72, 144, 216, 288];

// Cuatro sacuanjoches de adorno: [x, y, escala, color, animación].
const FLORES: [number, number, number, string, string][] = [
  [150, 150, 11, '#0a3880', 'flor-float'],
  [300, 400, 6, '#f2b00a', 'flor-float-2'],
  [1200, 130, 9, '#f2b00a', 'flor-float-2'],
  [1090, 400, 6.5, '#0a3880', 'flor-float'],
];

export function Hero() {
  return (
    <section id="main-content" className={styles.hero} aria-labelledby="portada-titulo">
      <svg
        className={styles.flores}
        width={1360}
        height={520}
        viewBox="0 0 1360 520"
        aria-hidden="true"
        focusable="false"
      >
        {FLORES.map(([x, y, escala, color, animacion]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${escala})`}>
            <g className={animacion} fill={color}>
              {ANGULOS.map((a) => (
                <path key={a} d={PETALO} transform={`rotate(${a})`} />
              ))}
            </g>
          </g>
        ))}
      </svg>

      <div className={styles.heroInterior}>
        <div className={styles.heroTexto}>
          <span className={`${styles.etiqueta} fade-up d1`}>
            <Sacuanjoche variante="icono" tamano={12} color="#f2b00a" centro="#0a3880" />
            Una comunidad democrática y cooperativa
          </span>
          <h1 id="portada-titulo" className={styles.titulo}>
            <span className={styles.palabra}>Nicaragua</span>
            <br />
            <span className={`${styles.palabra} ${styles.palabraAzul}`}>decide.</span>
          </h1>
          <p className={`${styles.descripcion} fade-up d3`}>
            Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido
            de las redes.
          </p>
        </div>

        <div className={`${styles.heroAccion} fade-up d4`}>
          <Link href="/login" className={styles.boton}>
            Únete a la comunidad <span aria-hidden="true">→</span>
          </Link>
          <Link href="/explore" className={styles.botonSecundario}>
            Cómo funciona
          </Link>
        </div>

        <div className={`${styles.heroVideo} fade-up d5`}>
          <VideoColmena />
        </div>
      </div>
    </section>
  );
}
