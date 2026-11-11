import Image from 'next/image';
import Link from 'next/link';
import Marca from '@/components/nav/Marca';
import { NewsletterForm } from '../newsletter/NewsletterForm';
import { CAMBIOS_FOTOS, CREDITOS } from './creditos';
import s from './secciones.module.css';

const CORREO = 'decidenicaragua@gmail.com';

export function QuienesSomos() {
  return (
    <section className={s.seccion} aria-labelledby="quienes-titulo">
      <div className={s.interior}>
        <h2 id="quienes-titulo" className={s.titulo}>
          Quiénes somos
        </h2>

        <div className={s.renacer}>
          <figure className={s.renacerFigura}>
            <Image
              src="/renacer.jpg"
              alt="Tres personas sonríen abrazadas con camisetas blancas de RENACER; detrás, una multitud con banderas de Nicaragua junto al mar."
              width={1536}
              height={1024}
              sizes="(min-width: 900px) 540px, calc(100vw - 32px)"
              className={s.renacerFoto}
            />
            <figcaption className={s.avisoIa}>Imagen ilustrativa creada con IA</figcaption>
          </figure>

          <div className={s.renacerTexto}>
            <h3 className={s.subtitulo}>Gracias a RENACER</h3>
            <p>
              RENACER es un grupo de nicaragüenses en el exilio. Apoya este proyecto, aportó muchas
              ideas sobre cómo organizarnos y decidir juntos, y forma el primer círculo de la
              comunidad.
            </p>
            <p>
              Cualquier grupo u organización puede sumarse en igualdad de condiciones. Los cargos
              se eligen por votación.
            </p>
          </div>
        </div>

        <div className={s.contactoFila}>
          <div className={s.caja}>
            <h3 className={s.subtitulo}>Boletín</h3>
            <p className={s.cajaTexto}>Recibe en tu correo las novedades de la comunidad.</p>
            <div className={s.boletin}>
              <NewsletterForm compact />
            </div>
          </div>

          <div id="contacto" className={s.caja}>
            <h3 className={s.subtitulo}>Contacto</h3>
            <p className={s.cajaTexto}>¿Tienes dudas o quieres colaborar? Escríbenos a {CORREO}.</p>
            <a href={`mailto:${CORREO}`} className={s.botonPrincipal}>
              Escribirnos
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Pie() {
  return (
    <footer className={s.pie}>
      <div className={s.interior}>
        <div className={s.pieArriba}>
          <Marca enlace="/" />
          <nav className={s.pieEnlaces} aria-label="Pie de página">
            <Link href="/explore">Mirar sin registrarse</Link>
            <Link href="/representantes">Quiénes nos representan</Link>
            <a href="#contacto">Contacto</a>
            <Link href="/login">Entrar</Link>
          </nav>
        </div>

        <h2 className={s.creditosTitulo}>Créditos de fotos y música</h2>
        <ul className={s.creditos}>
          {CREDITOS.map((c) => (
            <li key={c.obra}>
              {c.obra} — {c.autor} ·{' '}
              <a href={c.url} rel="noopener noreferrer">
                {c.licencia}
              </a>
            </li>
          ))}
        </ul>
        <p className={s.cambios}>{CAMBIOS_FOTOS}</p>
        <p className={s.pieNota}>Código abierto · Sin fines de lucro</p>
        <p className={s.pieImpulsado}>
          Impulsado por <strong>OpenCivic Solutions</strong>
        </p>
      </div>
    </footer>
  );
}
