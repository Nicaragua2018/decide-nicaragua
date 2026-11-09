import { Fraunces, Inter } from 'next/font/google';

// Fuentes de la portada. Solo se aplican dentro del envoltorio de la portada,
// mediante las variables CSS --pt-serif y --pt-sans.

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--pt-serif',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--pt-sans',
  display: 'swap',
});

/** Clases que definen --pt-serif y --pt-sans en el elemento que las lleve. */
export const clasesFuentes = `${fraunces.variable} ${inter.variable}`;
