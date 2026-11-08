'use client';

import { useState } from 'react';
import { COMPROMISO_MAX, COMPROMISOS_MAX, PRESENTACION_MAX } from '@decide/shared';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';
import { guardarCandidatura } from '@/lib/actions';

const CAMPOS = ['presentacion', ...Array.from({ length: COMPROMISOS_MAX }, (_, i) => `compromiso${i}`)];

/**
 * La ficha de quien se presenta: presentación (≤ 600) y hasta 3 compromisos (≤ 140 cada uno).
 * Sirve para presentarse y para cambiar la ficha propia. Pasa por la revisión previa como los
 * demás formularios (aviso del nivel 1, bloqueo o revisión de la mesa en el nivel 2).
 */
export function CandidaturaForm({
  eleccionId,
  editar = false,
  inicial,
  alTerminar,
}: {
  eleccionId: string;
  editar?: boolean;
  inicial?: { presentacion: string; compromisos: string[] };
  alTerminar?: () => void;
}) {
  const [presentacion, setPresentacion] = useState(inicial?.presentacion ?? '');
  const [compromisos, setCompromisos] = useState<string[]>(
    inicial && inicial.compromisos.length > 0 ? inicial.compromisos.slice(0, COMPROMISOS_MAX) : [''],
  );

  function ponerCompromiso(i: number, v: string) {
    setCompromisos((c) => c.map((x, j) => (j === i ? v : x)));
  }

  /**
   * La sugerencia llega como «presentación, línea en blanco, compromisos». La presentación puede
   * tener párrafos; los compromisos son de una sola línea: son los últimos trozos, uno por campo lleno.
   */
  function usarSugerencia(texto: string) {
    const partes = texto.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    const llenos = compromisos.filter((c) => c.trim().length > 0).length;
    if (llenos > 0 && partes.length >= 1 + llenos) {
      const corte = partes.length - llenos;
      setPresentacion(partes.slice(0, corte).join('\n\n').slice(0, PRESENTACION_MAX));
      setCompromisos(partes.slice(corte).map((p) => p.slice(0, COMPROMISO_MAX)));
    } else {
      setPresentacion(texto.trim().slice(0, PRESENTACION_MAX));
    }
  }

  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'candidatura',
    accion: guardarCandidatura,
    campos: CAMPOS,
    campoSugerencia: 'presentacion',
    alUsarSugerencia: usarSugerencia,
    reiniciar: false,
    alOk: alTerminar,
  });

  const idPres = `presentacion-${eleccionId}`;
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="form el-form">
      <input type="hidden" name="eleccionId" value={eleccionId} />
      {editar && <input type="hidden" name="editar" value="1" />}

      <div className="form-field">
        <label htmlFor={idPres} className="form-label">
          Preséntate: quién eres y por qué te presentas
        </label>
        <textarea
          id={idPres}
          name="presentacion"
          className="form-textarea"
          required
          maxLength={PRESENTACION_MAX}
          value={presentacion}
          onChange={(e) => setPresentacion(e.target.value)}
          aria-describedby={`${idPres}-cuenta`}
        />
        <span id={`${idPres}-cuenta`} className="form-hint">
          {presentacion.length} de {PRESENTACION_MAX} caracteres
        </span>
      </div>

      <fieldset className="el-fieldset">
        <legend className="form-label">Tus compromisos (hasta {COMPROMISOS_MAX})</legend>
        {compromisos.map((c, i) => {
          const id = `compromiso-${eleccionId}-${i}`;
          return (
            <div key={i} className="form-field mt-2">
              <label htmlFor={id} className="form-label">
                Compromiso {i + 1}
              </label>
              <input
                id={id}
                name={`compromiso${i}`}
                className="form-input"
                maxLength={COMPROMISO_MAX}
                value={c}
                onChange={(e) => ponerCompromiso(i, e.target.value)}
                aria-describedby={`${id}-cuenta`}
              />
              <span id={`${id}-cuenta`} className="form-hint">
                {c.length} de {COMPROMISO_MAX} caracteres
                {compromisos.length > 1 && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="el-enlace"
                      onClick={() => setCompromisos((x) => x.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        {compromisos.length < COMPROMISOS_MAX && (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2"
            onClick={() => setCompromisos((x) => [...x, ''])}
          >
            Añadir otro compromiso
          </button>
        )}
      </fieldset>

      <p className="form-hint">Tu ficha se ve igual que las demás: sin foto, con tus iniciales.</p>

      {aviso}
      {state && 'error' in state && (
        <p role="alert" className="alert alert-error">
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p role="status" className="alert alert-success">
          {editar ? 'Tu ficha quedó cambiada.' : 'Ya te presentaste. Tu ficha está publicada.'}
        </p>
      )}

      <div>
        <button type="submit" className="el-btn el-btn-primario" disabled={ocupado}>
          {editar ? 'Guardar mi ficha' : 'Presentarme'}
        </button>
      </div>
    </form>
  );
}
