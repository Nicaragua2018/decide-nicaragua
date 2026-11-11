import type { Cifras as CifrasDatos } from '@/lib/inicio';

/** Presentacional: solo pinta las cifras que llegaron; las que fallaron (null) se omiten. */
export default function Cifras({ cifras }: { cifras: CifrasDatos }) {
  const items = [
    { n: cifras.miembros, texto: 'miembros verificados', d: 'd3' },
    { n: cifras.preguntas, texto: 'preguntas abiertas', d: 'd4' },
    { n: cifras.elecciones, texto: 'elecciones en curso', d: 'd5' },
  ].filter((i): i is { n: number; texto: string; d: string } => i.n !== null);
  if (items.length === 0) return null;
  return (
    <ul className="inicio-cifras" aria-label="Cifras de tu comunidad">
      {items.map((i) => (
        <li key={i.texto} className={`inicio-cifra fade-up ${i.d}`}>
          <span className="inicio-cifra-n">{i.n}</span>
          <span className="inicio-cifra-t">{i.texto}</span>
        </li>
      ))}
    </ul>
  );
}
