import Link from 'next/link';
import { VideoColmena } from './VideoColmena';
import styles from './portada.module.css';

export function Hero() {
  return (
    <section id="main-content" className={styles.hero} aria-labelledby="portada-titulo">
      <div className={styles.heroInterior}>
        <div className={styles.heroTexto}>
          <h1 id="portada-titulo" className={styles.titulo}>
            <span className={styles.palabra}>Nicaragua</span>
            <br />
            <span className={`${styles.palabra} ${styles.palabraAzul}`}>decide.</span>
          </h1>
          <p className={styles.descripcion}>
            Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido
            de las redes.
          </p>
        </div>

        <div className={styles.heroVideo}>
          <VideoColmena />
        </div>

        <div className={styles.heroAccion}>
          <Link href="/login" className={styles.boton}>
            Únete a la colmena <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
