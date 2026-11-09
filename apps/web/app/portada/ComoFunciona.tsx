import { DIBUJOS, Hexagono, type ColorCelda } from './Hexagono';
import s from './secciones.module.css';

const PASOS: { titulo: string; texto: string; color: ColorCelda; dibujo: keyof typeof DIBUJOS }[] = [
  {
    titulo: 'Planteas una inquietud.',
    texto: 'Algo que tu comunidad necesita o quiere cambiar.',
    color: 'amarillo',
    dibujo: 'inquietud',
  },
  {
    titulo: 'Se debate.',
    texto: 'Todos opinan y se ve en qué estamos de acuerdo.',
    color: 'azul',
    dibujo: 'debate',
  },
  {
    titulo: 'Se vota.',
    texto: 'Apruebas, rechazas u ordenas las soluciones.',
    color: 'amarillo',
    dibujo: 'voto',
  },
  {
    titulo: 'Una comisión lo lleva a cabo.',
    texto: 'Personas de la comunidad hacen lo decidido y rinden cuentas.',
    color: 'azul',
    dibujo: 'comision',
  },
  {
    titulo: 'Todos ven el resultado.',
    texto: 'Lo aprobado, lo rechazado y las cifras quedan a la vista.',
    color: 'amarillo',
    dibujo: 'resultado',
  },
];

export function ComoFunciona() {
  return (
    <section className={s.seccion} aria-labelledby="como-funciona-titulo">
      <div className={s.interior}>
        <h2 id="como-funciona-titulo" className={s.titulo}>
          Cómo funciona la colmena
        </h2>

        <ol className={s.pasos}>
          {PASOS.map((p, i) => (
            <li key={p.titulo} className={s.paso}>
              <div className={s.pasoCelda}>
                <Hexagono color={p.color} tamano={64}>
                  {DIBUJOS[p.dibujo]}
                </Hexagono>
                <span className={s.pasoNumero} aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <div>
                <h3 className={s.pasoTitulo}>{p.titulo}</h3>
                <p className={s.pasoTexto}>{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
