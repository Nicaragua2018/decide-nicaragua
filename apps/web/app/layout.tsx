import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Cormorant_Garamond, Inter, Poppins } from 'next/font/google';
import './globals.css';
import './navegacion.css';
import './guardian.css';
import './inicio.css';
import './inquietudes.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-poppins',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  // URL base para las imágenes de redes (opengraph-image) de todas las páginas.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://nicaraguadecide.org'),
  title: {
    default: 'Nicaragua Decide',
    template: '%s | Nicaragua Decide',
  },
  description:
    'Plataforma de participación democrática verificable para ciudadanos nicaragüenses.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${cormorant.variable} ${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
