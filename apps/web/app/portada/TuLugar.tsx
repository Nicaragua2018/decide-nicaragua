import s from './secciones.module.css';

export function TuLugar() {
  return (
    <section className={`${s.seccion} ${s.seccionNiebla}`} aria-labelledby="tu-lugar-titulo">
      <div className={`${s.interior} ${s.dosColumnas}`}>
        <div>
          <h2 id="tu-lugar-titulo" className={s.titulo}>
            Tu lugar en la comunidad
          </h2>

          <ul className={s.puntos}>
            <li>
              <strong>Dos comunidades por persona:</strong> la de tu territorio de origen y la del
              país donde vives.
            </li>
            <li>Además, el espacio general «Exilio y diáspora».</li>
            <li>
              Los cargos (mesa, coordinadores y observadores) se eligen por voto y se pueden
              revocar.
            </li>
            <li>
              <strong>Nadie manda desde el centro.</strong> Si un grupo pierde una votación, puede
              llevar a cabo su idea como iniciativa propia, sin hablar por todos.
            </li>
          </ul>
        </div>

        {/* Dibujo: tus tres celdas. Repite lo que dice la lista, por eso va oculto. */}
        <div className={s.panal} aria-hidden="true">
          <span className={`${s.celda} ${s.celdaAmarilla}`}>Tu territorio de origen</span>
          <span className={`${s.celda} ${s.celdaAzul}`}>El país donde vives</span>
          <span className={`${s.celda} ${s.celdaBlanca}`}>Exilio y diáspora</span>
        </div>
      </div>
    </section>
  );
}
