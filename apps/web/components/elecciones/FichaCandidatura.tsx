import type { CandidaturaVista } from '@decide/shared';
import { Hexagono } from './Hexagono';

/**
 * El contenido de una ficha, solo con <span>: así cabe también dentro de un botón (la papeleta).
 * Todas las fichas son iguales: iniciales en un hexágono, presentación, compromisos y comunidades.
 */
export function FichaContenido({ ficha, marca }: { ficha: CandidaturaVista; marca?: string | null }) {
  return (
    <span className="el-ficha-cuerpo">
      <span className="el-ficha-cabeza">
        <Hexagono texto={ficha.iniciales} variante={marca ? 'oro' : 'claro'} tamano={52} />
        <span>
          <span className="el-ficha-nombre">{ficha.nombre}</span>
          {marca && <span className="el-ficha-marca">{marca}</span>}
          {ficha.comunidades && <span className="el-ficha-comunidades">{ficha.comunidades}</span>}
        </span>
      </span>
      <span className="el-ficha-presentacion">{ficha.presentacion}</span>
      {ficha.compromisos.length > 0 && (
        <span className="el-ficha-compromisos">
          <span className="el-ficha-subtitulo">Se compromete a</span>
          {ficha.compromisos.map((c, i) => (
            <span key={i} className="el-ficha-compromiso">
              {c}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function FichaCandidatura({ ficha, children }: { ficha: CandidaturaVista; children?: React.ReactNode }) {
  return (
    <article className="el-ficha" aria-label={`Ficha de ${ficha.nombre}`}>
      <FichaContenido ficha={ficha} />
      {children}
    </article>
  );
}
