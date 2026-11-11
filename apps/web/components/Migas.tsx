import Link from 'next/link';

export interface ItemMiga {
  texto: string;
  ruta?: string;
}

/** Las migas de pan: «Inicio › Participar › Inquietudes». El último elemento es la página actual. */
export function Migas({ items }: { items: ItemMiga[] }) {
  return (
    <nav aria-label="Estás en" className="migas">
      <ol>
        {items.map((item, i) => {
          const ultimo = i === items.length - 1;
          return (
            <li key={`${item.texto}-${i}`}>
              {item.ruta && !ultimo ? (
                <Link href={item.ruta}>{item.texto}</Link>
              ) : (
                <span aria-current={ultimo ? 'page' : undefined}>{item.texto}</span>
              )}
              {!ultimo && <span className="migas-sep" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
