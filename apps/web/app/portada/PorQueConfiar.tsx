import { Sacuanjoche } from '@/components/marca/Sacuanjoche';
import s from './secciones.module.css';

const REPO = 'https://github.com/Nicaragua2018/decide-nicaragua';

const RAZONES: { texto: string; enlace?: string }[] = [
  { texto: 'Entras con el aval de alguien que te conoce.' },
  { texto: 'Tu voto es secreto.' },
  {
    texto: 'El código es abierto y cualquiera puede revisarlo.',
    enlace: REPO,
  },
  {
    texto: 'El asistente de IA ayuda a resumir y ordenar, pero nunca decide.',
  },
];

export function PorQueConfiar() {
  return (
    <section className={`${s.seccion} ${s.seccionNiebla}`} aria-labelledby="confiar-titulo">
      <div className={s.interior}>
        <h2 id="confiar-titulo" className={s.titulo}>
          Por qué confiar
        </h2>

        <ul className={s.razones}>
          {RAZONES.map((r) => (
            <li key={r.texto} className={s.razon}>
              <Sacuanjoche variante="icono" tamano={20} />
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
