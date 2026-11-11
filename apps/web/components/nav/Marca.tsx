import Link from 'next/link';
import { Sacuanjoche } from '@/components/marca/Sacuanjoche';

/** Píldora blanca con el logo y «Nicaragua Decide». Sin hooks: sirve en servidor y en cliente. */
export default function Marca({ enlace, textoOculto = false }: { enlace: string; textoOculto?: boolean }) {
  return (
    <Link href={enlace} className={`navbar-marca${textoOculto ? ' navbar-marca-compacta' : ''}`}>
      <Sacuanjoche variante="logo" tamano={34} />
      <span className="navbar-marca-texto">
        Nicaragua <span>Decide</span>
      </span>
    </Link>
  );
}
