import Link from 'next/link';
import Marca from '@/components/nav/Marca';
import { ShareButton } from '../components/ShareButton';
import styles from './portada.module.css';

export function Barra() {
  return (
    <header className={styles.barra}>
      <nav className={styles.barraInterior} aria-label="Principal">
        <Marca enlace="/" />

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
