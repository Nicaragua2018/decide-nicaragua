import s from './secciones.module.css';

const PASOS: { titulo: string; texto: string; color: 'amarillo' | 'azul' }[] = [
  {
    titulo: 'Planteas una inquietud.',
    texto: 'Algo que tu comunidad necesita o quiere cambiar.',
    color: 'amarillo',
  },
  {
    titulo: 'Se debate.',
    texto: 'Todos opinan y se ve en qué estamos de acuerdo.',
    color: 'azul',
  },
  {
    titulo: 'Se vota.',
    texto: 'Apruebas, rechazas u ordenas las soluciones.',
    color: 'amarillo',
  },
  {
    titulo: 'Una comisión lo lleva a cabo.',
    texto: 'Personas de la comunidad hacen lo decidido y rinden cuentas.',
    color: 'azul',
  },
  {
    titulo: 'Todos ven el resultado.',
    texto: 'Lo aprobado, lo rechazado y las cifras quedan a la vista.',
    color: 'amarillo',
  },
];

export function ComoFunciona() {
  return (
    <section className={s.seccion} aria-labelledby="como-funciona-titulo">
      <div className={s.interior}>
        <div className={s.cabecera}>
          <h2 id="como-funciona-titulo" className={s.titulo}>
            Cómo funciona la comunidad
          </h2>
          <p className={s.entrada}>De la inquietud al resultado, en cinco pasos</p>
        </div>

        <ol className={s.pasos}>
          {PASOS.map((p, i) => (
            <li key={p.titulo} className={s.paso}>
              <span
                className={`${s.cuadrado} ${p.color === 'amarillo' ? s.cuadradoAmarillo : s.cuadradoAzul}`}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className={s.pasoTitulo}>{p.titulo}</h3>
              <p className={s.pasoTexto}>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
