import type { ResultadoEleccionVista } from '@decide/shared';
import { Hexagono } from './Hexagono';

const SIN_NOMBRE = 'Candidatura retirada u oculta';

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function listaNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * El porcentaje solo para mostrar, con un decimal y redondeado hacia el lado correcto de la mitad:
 * nunca dice «50 %» si no es exactamente la mitad, para no contradecir la línea punteada.
 */
export function pctTexto(aparece: number, validas: number): string {
  if (validas <= 0) return '0 %';
  const exacto = (100 * aparece) / validas;
  const d = 2 * aparece > validas ? Math.ceil(exacto * 10) / 10 : 2 * aparece < validas ? Math.floor(exacto * 10) / 10 : 50;
  return `${d.toLocaleString('es-NI', { maximumFractionDigits: 1 })} %`;
}

/** «Cómo se decidió» en 3 frases, armadas con las cifras reales del conteo. */
export function frasesDelResultado(r: ResultadoEleccionVista): string[] {
  const votaron = r.papeletasTotal;
  const pct = r.miembros > 0 ? Math.round((100 * votaron) / r.miembros) : 0;
  const validas = votaron - r.abstenciones;
  const primera =
    `Votaron ${votaron} de ${plural(r.miembros, 'persona', 'personas')} que podían votar (${pct} %)` +
    (r.abstenciones > 0 ? `; ${plural(r.abstenciones, 'se abstuvo', 'se abstuvieron')}.` : '.');

  if (r.sinQuorum) {
    return [
      primera,
      'Hacía falta una participación mínima, fijada en las reglas, y no se alcanzó: nadie quedó elegido.',
      'Quien ocupaba el puesto sigue en funciones y la elección se repite en 30 días.',
    ];
  }

  const segunda =
    `Para quedar elegida, una persona tenía que aparecer en más de la mitad de las ${plural(validas, 'papeleta', 'papeletas')} ` +
    `sin abstención, es decir, en ${Math.floor(validas / 2) + 1} o más.`;

  const nombres = r.electas.map((e) => e.nombre);
  let tercera: string;
  if (nombres.length === 0) {
    tercera = 'Nadie cruzó la mitad: el puesto queda sin elegir, quien lo ocupaba sigue en funciones y se repite en 30 días.';
  } else {
    tercera =
      `Entre quienes la cruzaron, los duelos uno a uno dieron el orden: ` +
      `${listaNombres(nombres)} ${nombres.length === 1 ? 'ocupa el puesto' : 'ocupan los puestos'}.`;
    if (r.vacantes > 0) {
      tercera += ` ${plural(r.vacantes, 'puesto queda', 'puestos quedan')} sin elegir y se repiten en 30 días.`;
    }
  }
  if (r.semilla) tercera += ' Hubo un empate exacto y se resolvió con la semilla pública.';
  return [primera, segunda, tercera];
}

function Matriz({ nombre, m, etiquetas }: { nombre: string; m: number[][]; etiquetas: string[] }) {
  if (m.length === 0) return null;
  return (
    <div className="el-matriz">
      <p className="el-subtitulo">{nombre}</p>
      <table>
        <thead>
          <tr>
            <th>
              <span className="sr-only">Candidatura</span>
            </th>
            {etiquetas.map((e, j) => (
              <th key={j} scope="col">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.map((fila, i) => (
            <tr key={i}>
              <th scope="row">{etiquetas[i]}</th>
              {fila.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultadoEleccion({ resultado: r, eleccionId }: { resultado: ResultadoEleccionVista; eleccionId: string }) {
  const nombre = new Map(r.filas.map((f) => [f.candidaturaId, f.nombre]));
  for (const e of r.electas) nombre.set(e.candidaturaId, e.nombre);
  const nombreDe = (id: string) => nombre.get(id) ?? SIN_NOMBRE;
  const filas = [...r.filas].sort((a, b) => b.aparece - a.aparece);
  const datos = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(r, null, 2))}`;

  return (
    <div className="el-resultado">
      <section className="el-panal" aria-labelledby="electas-titulo">
        <h2 id="electas-titulo" className="el-h2">
          {r.electas.length === 1 ? 'Quedó elegida' : r.electas.length > 1 ? 'Quedaron elegidas' : 'Nadie quedó elegido'}
        </h2>
        {r.electas.length > 0 && (
          <ul className="el-panal-lista">
            {r.electas.map((e) => (
              <li key={e.candidaturaId} className="el-panal-persona">
                <Hexagono texto={e.iniciales} variante="oro" tamano={72} />
                <span className="el-panal-nombre">{e.nombre}</span>
              </li>
            ))}
          </ul>
        )}
        {r.vacantes > 0 && <p className="el-nota">{plural(r.vacantes, 'puesto quedó', 'puestos quedaron')} sin elegir.</p>}
      </section>

      <section className="el-bloque" aria-labelledby="como-titulo">
        <h2 id="como-titulo" className="el-h2">Cómo se decidió</h2>
        <ol className="el-pasos-texto">
          {frasesDelResultado(r).map((f, i) => (
            <li key={i}>
              <span className="el-num" aria-hidden="true">{i + 1}</span>
              <span>{f}</span>
            </li>
          ))}
        </ol>
      </section>

      {filas.length > 0 && !r.sinQuorum && (
        <section className="el-bloque" aria-labelledby="barras-titulo">
          <h2 id="barras-titulo" className="el-h2">¿En cuántas papeletas aparece cada persona?</h2>
          <ul className="el-barras">
            {filas.map((f) => (
              <li key={f.candidaturaId} className="el-barra-fila">
                <span className="el-barra-nombre">
                  {f.nombre}
                  {f.electa && <span className="el-insignia el-insignia-oro">Elegida</span>}
                </span>
                <span className="el-barra-pista">
                  <span
                    className={`el-barra${f.electa ? ' el-barra-electa' : ''}`}
                    style={{ width: `${f.validas > 0 ? Math.min(Math.max((100 * f.aparece) / f.validas, 0), 100) : 0}%` }}
                  />
                  <span className="el-barra-mitad" aria-hidden="true" />
                </span>
                <span className="el-barra-pct">
                  {f.aparece} de {plural(f.validas, 'papeleta', 'papeletas')} ({pctTexto(f.aparece, f.validas)})
                  <span className="el-barra-mitad-texto">
                    {2 * f.aparece > f.validas ? 'más de la mitad' : 'la mitad o menos'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="el-nota">La línea punteada marca la mitad: quien no la cruza no puede quedar elegido.</p>
          <p className="el-nota">Se cuentan las papeletas sin abstención.</p>
        </section>
      )}

      {r.duelos.length > 0 && (
        <section className="el-bloque" aria-labelledby="duelos-titulo">
          <h2 id="duelos-titulo" className="el-h2">Los duelos</h2>
          <p className="el-nota">Cada papeleta que pone a una persona por delante de otra cuenta como un voto en su duelo.</p>
          <ul className="el-duelos">
            {r.duelos.map((d) => (
              <li key={`${d.gana}-${d.pierde}`}>
                <span className="font-medium">{nombreDe(d.gana)}</span>
                <span className="el-flecha" aria-hidden="true"> → </span>
                <span className="sr-only"> le gana a </span>
                <span className="font-medium">{nombreDe(d.pierde)}</span>
                <span className="el-nota"> · {d.aFavor} papeletas contra {d.enContra}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="el-verificar">
        <summary>Para verificar</summary>
        <Matriz nombre="Comparaciones de a pares" m={r.pairwiseMatrix} etiquetas={r.candidatasOrden.map(nombreDe)} />
        <Matriz nombre="Caminos más fuertes (Schulze)" m={r.schulzeMatrix} etiquetas={r.candidatasOrden.map(nombreDe)} />
        <p className="el-nota mt-2">
          Semilla pública del desempate: {r.semilla ? <code>{r.semilla}</code> : 'no hizo falta.'}
        </p>
        <p className="mt-2">
          <a href={datos} download={`eleccion-${eleccionId}.json`} className="el-btn el-btn-secundario">
            Descargar los datos
          </a>
        </p>
      </details>
    </div>
  );
}
