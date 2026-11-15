import type { MetadataRoute } from 'next';

/**
 * Solo la portada se ofrece a los buscadores. Las demás páginas llevan «noindex»
 * (app/layout.tsx); no se bloquean aquí para que el buscador pueda leer esa marca.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/portada/'],
      disallow: ['/api/', '/login', '/invite'],
    },
  };
}
