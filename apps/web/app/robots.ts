import type { MetadataRoute } from 'next';

/** Solo la parte pública se ofrece a los buscadores; lo que pide sesión no se indexa. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/explore', '/representantes', '/portada/'],
      disallow: ['/api/', '/login', '/invite'],
    },
  };
}
