import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Decide Nicaragua',
    template: '%s | Decide Nicaragua',
  },
  description:
    'Plataforma de participación democrática verificable para ciudadanos nicaragüenses.',
  robots: {
    index: false,  // No indexar mientras esté en desarrollo / círculo cerrado
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
