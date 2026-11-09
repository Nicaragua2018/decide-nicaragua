import { DIBUJOS, Hexagono, type ColorCelda } from './Hexagono';
import s from './secciones.module.css';

const REPO = 'https://github.com/Nicaragua2018/decide-nicaragua';

const RAZONES: { texto: string; color: ColorCelda; dibujo: keyof typeof DIBUJOS; enlace?: string }[] = [
  { texto: 'Entras con el aval de alguien que te conoce.', color: 'amarillo', dibujo: 'aval' },
  { texto: 'Tu voto es secreto.', color: 'azul', dibujo: 'secreto' },
  {
    texto: 'El código es abierto y cualquiera puede revisarlo.',
    color: 'amarillo',
    dibujo: 'codigo',
    enlace: REPO,
  },
  {
    texto: 'El asistente de IA ayuda a resumir y ordenar, pero nunca decide.',
    color: 'azul',
    dibujo: 'asistente',
  },
];

export function PorQueConfiar() {
  return (
    <section className={`${s.seccion} ${s.seccionPlatino}`} aria-labelledby="confiar-titulo">
      <div className={s.interior}>
        <h2 id="confiar-titulo" className={s.titulo}>
          Por qué confiar
        </h2>

        <ul className={s.razones}>
          {RAZONES.map((r) => (
            <li key={r.texto} className={s.razon}>
              <Hexagono color={r.color} tamano={52}>
                {DIBUJOS[r.dibujo]}
              </Hexagono>
              <p>
                {r.texto}
                {r.enlace && (
                  <>
                    {' '}
                    <a href={r.enlace} className={s.enlaceTexto} rel="noopener noreferrer">
                      Ver el código
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
