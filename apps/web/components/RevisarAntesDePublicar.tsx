'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { MODERACION_CAUSAS, textoParaRevisar, type RevisionTexto, type TipoTexto } from '@decide/shared';
import { revisarTexto, type ActionResult } from '@/lib/actions';

export type ModoEnvio = 'normal' | 'omitir' | 'pedir';

function etiquetaCausa(causa: string | undefined): string | null {
  if (!causa) return null;
  return MODERACION_CAUSAS.find((c) => c.value === causa)?.label ?? causa;
}

/** El recuadro del aviso (nivel 1), del bloqueo (nivel 2) o de «quedó en revisión». */
export function AvisoRevision({
  revision,
  enRevision,
  ocupado,
  onUsarSugerencia,
  onPublicarComoEsta,
  onPedirRevision,
}: {
  revision: RevisionTexto | null;
  enRevision: boolean;
  ocupado: boolean;
  onUsarSugerencia: (sugerencia: string) => void;
  onPublicarComoEsta: () => void;
  onPedirRevision: () => void;
}) {
  if (enRevision) {
    return (
      <div className="alert alert-info" role="status">
        <p>Tu texto quedó en revisión. La mesa lo verá en un máximo de 7 días.</p>
        <p>
          <Link href="/me/revisiones">Mis textos en revisión</Link>
        </p>
      </div>
    );
  }
  if (!revision || revision.nivel === 0) return null;

  const sugerencia = revision.sugerencia;

  if (revision.nivel === 1) {
    return (
      <div className="alert alert-warning" role="status">
        <p>Esta frase puede ofender y restarle apoyo a tu idea. ¿Quieres decirla de otra forma?</p>
        {sugerencia && (
          <>
            <p className="text-sm font-medium mt-2">Sugerencia del asistente</p>
            <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{sugerencia}</p>
          </>
        )}
        <div className="flex gap-2 mt-2">
          {sugerencia && (
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => onUsarSugerencia(sugerencia)}>
              Usar la sugerencia
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onPublicarComoEsta}>
            Publicar como está
          </button>
        </div>
      </div>
    );
  }

  const causa = etiquetaCausa(revision.causa);
  return (
    <div className="alert alert-error" role="alert">
      <p className="card-title">Así no se puede publicar</p>
      {causa && <p className="text-sm font-medium">{causa}</p>}
      {revision.explicacion && <p className="text-sm">{revision.explicacion}</p>}
      {sugerencia && (
        <>
          <p className="text-sm font-medium mt-2">Sugerencia del asistente</p>
          <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{sugerencia}</p>
        </>
      )}
      <div className="flex gap-2 mt-2">
        {sugerencia && (
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => onUsarSugerencia(sugerencia)}>
            Usar la sugerencia
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onPedirRevision}>
          Pedir revisión a la mesa
        </button>
      </div>
    </div>
  );
}

/**
 * Estado de la revisión previa para cualquier formulario.
 * - `revisar(texto)` llama al asistente; devuelve `true` si se puede enviar (nivel 0 o asistente sin respuesta).
 * - `recibir(resultado)` toma la respuesta del envío: un 422 muestra el bloqueo y un 202 el «quedó en revisión».
 */
export function useRevisionPrevia(tipo: TipoTexto) {
  const [revision, setRevision] = useState<RevisionTexto | null>(null);
  const [enRevision, setEnRevision] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const limpiar = useCallback(() => {
    setRevision(null);
    setEnRevision(false);
  }, []);

  const revisar = useCallback(
    async (texto: string): Promise<boolean> => {
      setRevision(null);
      setEnRevision(false);
      if (texto.trim().length === 0) return true;
      setRevisando(true);
      try {
        const r = await revisarTexto(tipo, texto);
        if (r.revisado && r.nivel > 0) {
          setRevision(r);
          return false;
        }
        return true;
      } finally {
        setRevisando(false);
      }
    },
    [tipo],
  );

  /** `true` si el resultado era un bloqueo o un «en revisión» (ya se muestra). */
  const recibir = useCallback((r: unknown): boolean => {
    if (r && typeof r === 'object') {
      if ('revision' in r) {
        setRevision((r as { revision: RevisionTexto }).revision);
        setEnRevision(false);
        return true;
      }
      if ('enRevision' in r) {
        setRevision(null);
        setEnRevision(true);
        return true;
      }
    }
    return false;
  }, []);

  const aviso = useCallback(
    (p: { ocupado: boolean; onUsarSugerencia: (s: string) => void; onPublicarComoEsta: () => void; onPedirRevision: () => void }) => (
      <AvisoRevision revision={revision} enRevision={enRevision} {...p} />
    ),
    [revision, enRevision],
  );

  return { revision, enRevision, revisando, revisar, recibir, limpiar, aviso };
}

/**
 * Formulario con revisión previa: antes de enviar llama al asistente.
 * `campos` son los nombres de los campos de texto, en el mismo orden que usa el servidor
 * (`textoParaRevisar`). «Usar la sugerencia» reemplaza `campoSugerencia` sin enviar.
 * Para campos controlados con estado de React, pasa `alUsarSugerencia`.
 */
export function useFormConRevision({
  tipo,
  accion,
  campos,
  campoSugerencia,
  alUsarSugerencia,
  alUsarTitulo,
  reiniciar = true,
  alOk,
}: {
  tipo: TipoTexto;
  accion: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  campos: string[];
  campoSugerencia: string;
  alUsarSugerencia?: ((texto: string) => void) | undefined;
  /** Formularios con título y cuerpo: la sugerencia se parte en la primera línea en blanco. */
  alUsarTitulo?: ((texto: string) => void) | undefined;
  /** Vacía el formulario al publicar (solo para campos sin estado de React). */
  reiniciar?: boolean;
  alOk?: (() => void) | undefined;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pendiente] = useActionState<ActionResult | null, FormData>(accion, null);
  const [, startTransition] = useTransition();
  const rev = useRevisionPrevia(tipo);
  const { recibir } = rev;
  const enCurso = useRef(false);

  useEffect(() => {
    if (!state) return;
    if (recibir(state)) return;
    if ('success' in state) {
      if (reiniciar) formRef.current?.reset();
      alOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function lanzar(modo: ModoEnvio) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (modo === 'pedir') fd.set('pedirRevision', '1');
    startTransition(() => {
      dispatch(fd);
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enCurso.current || pendiente) return;
    enCurso.current = true;
    try {
      const fd = new FormData(e.currentTarget);
      const texto = textoParaRevisar(...campos.map((c) => String(fd.get(c) ?? '')));
      if (await rev.revisar(texto)) lanzar('normal');
    } finally {
      enCurso.current = false;
    }
  }

  function ponerCampo(nombre: string, valor: string) {
    const el = formRef.current?.elements.namedItem(nombre);
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.value = valor;
  }

  function usarSugerencia(texto: string) {
    // Con título y cuerpo, el asistente devuelve «título, línea en blanco, cuerpo».
    const corte = campos.length === 2 ? /\r?\n\r?\n/.exec(texto) : null;
    const titulo = corte ? texto.slice(0, corte.index).trim() : null;
    const cuerpo = corte ? texto.slice(corte.index + corte[0].length).trim() : texto;
    if (titulo !== null && campos[0]) {
      if (alUsarTitulo) alUsarTitulo(titulo);
      else ponerCampo(campos[0], titulo);
    }
    if (alUsarSugerencia) alUsarSugerencia(cuerpo);
    else ponerCampo(campoSugerencia, cuerpo);
    rev.limpiar();
  }

  const ocupado = pendiente || rev.revisando;
  const aviso = rev.aviso({
    ocupado,
    onUsarSugerencia: usarSugerencia,
    onPublicarComoEsta: () => lanzar('omitir'),
    onPedirRevision: () => lanzar('pedir'),
  });

  return { formRef, onSubmit, state, ocupado, revisando: rev.revisando, pendiente, aviso };
}
