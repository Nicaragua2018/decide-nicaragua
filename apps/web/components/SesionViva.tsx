'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { renovarSesion, tocaRenovar, ultimaRenovacion } from '@/lib/sesion';

/**
 * Mantiene abierta la sesión mientras haya una página de Nicaragua Decide abierta.
 * Si la sesión ya no se puede renovar, avisa en vez de sacar a la persona: puede
 * estar escribiendo algo y necesita copiarlo antes de volver a entrar.
 */
export default function SesionViva() {
  const [vencida, setVencida] = useState(false);
  const vencidaRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    let montado = true;

    const marcar = (valor: boolean) => {
      vencidaRef.current = valor;
      if (montado) setVencida(valor);
    };

    const revisar = () => {
      if (vencidaRef.current) {
        // Si la persona volvió a entrar en otra pestaña, el aviso sobra.
        if (!tocaRenovar(Date.now(), ultimaRenovacion())) marcar(false);
        return;
      }
      void renovarSesion().then((resultado) => {
        if (resultado === 'vencida') marcar(true);
      });
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar();
    };

    revisar();
    const reloj = window.setInterval(revisar, 60_000);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', revisar);
    window.addEventListener('online', revisar);

    return () => {
      montado = false;
      window.clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', revisar);
      window.removeEventListener('online', revisar);
    };
  }, []);

  if (!vencida) return null;

  return (
    <div
      className="alert alert-warning"
      role="alert"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 1000, margin: '0 auto', maxWidth: 560 }}
    >
      Tu sesión venció. Si estabas escribiendo algo, cópialo antes de continuar.{' '}
      <a href={`/login?next=${encodeURIComponent(pathname)}`}>Volver a entrar</a>
    </div>
  );
}
