import Link from 'next/link';
import { ShareButton } from '../components/ShareButton';
import styles from './portada.module.css';

export function Barra() {
  return (
    <header className={styles.barra}>
      <nav className={styles.barraInterior} aria-label="Principal">
        <Link href="/" className={styles.marca}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-nicaragua-decide.svg" alt="" width={36} height={36} />
          <span>
            Nicaragua <span className={styles.marcaAzul}>Decide</span>
          </span>
        </Link>

        <div className={styles.barraAcciones}>
          <a href="#contacto" className={styles.barraEnlace}>
            Contacto
          </a>
          <ShareButton variant="nav" />
          <Link href="/login" className={styles.barraEntrar}>
            Entrar
          </Link>
        </div>
      </nav>
    </header>
  );
}
