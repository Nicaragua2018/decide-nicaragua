import type { Metadata } from 'next';
import { Barra } from './portada/Barra';
import { Hero } from './portada/Hero';
import { ComoFunciona } from './portada/ComoFunciona';
import { TuLugar } from './portada/TuLugar';
import { LoQueDecidimos } from './portada/LoQueDecidimos';
import { PorQueConfiar } from './portada/PorQueConfiar';
import { Pie, QuienesSomos } from './portada/QuienesSomos';
import portada from './portada/portada.module.css';

const TITULO = 'Nicaragua decide — una comunidad democrática y cooperativa';
const DESCRIPCION =
  'Confianza, comunicación y coordinación entre afines. Sin manipulación y sin el ruido de las redes.';

export const metadata: Metadata = {
  // «absolute»: sin la coletilla «| Decide Nicaragua» que añade el layout.
  title: { absolute: TITULO },
  description: DESCRIPCION,
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    type: 'website',
    locale: 'es_NI',
    siteName: 'Nicaragua Decide',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRIPCION,
  },
};

export default function LandingPage() {
  return (
    <div className={portada.portada}>
      <a href="#main-content" className="skip-link">
        Ir al contenido principal
      </a>
      <Barra />
      <main>
        <Hero />
        <ComoFunciona />
        <TuLugar />
        <LoQueDecidimos />
        <PorQueConfiar />
        <QuienesSomos />
      </main>
      <Pie />
    </div>
  );
}
