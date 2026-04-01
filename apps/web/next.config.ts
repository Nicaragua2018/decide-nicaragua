import type { NextConfig } from 'next';

const config: NextConfig = {
  // Salida standalone para Docker (incluye server.js + node_modules mínimos)
  output: 'standalone',

  // Transpila paquetes del monorepo (necesario en dev, no-op en prod con dist/)
  transpilePackages: ['@decide/shared'],

  // Variables de entorno expuestas al cliente (prefijo NEXT_PUBLIC_)
  // No incluir secretos aquí
  env: {
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? '',
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? '',
  },

  // El API está en un dominio/puerto diferente; proxy en desarrollo
  async rewrites() {
    const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default config;
