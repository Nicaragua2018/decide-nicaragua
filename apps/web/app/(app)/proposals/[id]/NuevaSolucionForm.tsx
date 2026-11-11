'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createSolucion } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export interface BorradorElegido {
  indice: number;
  titulo: string;
  descripcion: string;
}

interface Estado {
  title: string;
  description: string;
  borrador: number | null;
  setTitle: (t: string) => void;
  setDescription: (d: string) => void;
  setBorrador: (i: number | null) => void;
}

const SolucionContext = createContext<Estado | null>(null);

/** Guarda lo escrito y el borrador elegido; así el formulario se pinta una sola vez. */
export function SolucionProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [borrador, setBorrador] = useState<number | null>(null);
  return (
    <SolucionContext.Provider value={{ title, description, borrador, setTitle, setDescription, setBorrador }}>
      {children}
    </SolucionContext.Provider>
  );
}

/** Rellena el formulario con un borrador. Si ya hay algo escrito, pregunta antes de reemplazarlo. */
export function useUsarBorrador() {
  const e = useContext(SolucionContext);
  return (b: BorradorElegido) => {
    if (!e) return;
    const escrito = e.title.trim() !== '' || e.description.trim() !== '';
    const igual = e.title === b.titulo && e.description === b.descripcion;
    if (escrito && !igual && !window.confirm('¿Reemplazar lo que escribiste con el borrador?')) return;
    e.setTitle(b.titulo);
    e.setDescription(b.descripcion);
    e.setBorrador(b.indice);
    document.getElementById('nueva-solucion')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}

export function NuevaSolucionForm({ proposalId }: { proposalId: string }) {
  const e = useContext(SolucionContext);
  const [t0, st0] = useState('');
  const [d0, sd0] = useState('');
  const title = e?.title ?? t0;
  const setTitle = e?.setTitle ?? st0;
  const description = e?.description ?? d0;
  const setDescription = e?.setDescription ?? sd0;
  const borrador = e?.borrador ?? null;
  const setBorrador = e?.setBorrador;
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'solucion',
    accion: createSolucion.bind(null, proposalId),
    campos: ['title', 'description'],
    campoSugerencia: 'description',
    alUsarSugerencia: setDescription,
    alUsarTitulo: setTitle,
    reiniciar: false,
    alVaciar: () => {
      setTitle('');
      setDescription('');
      setBorrador?.(null);
    },
  });

  return (
    <form id="nueva-solucion" ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
      {borrador !== null && <input type="hidden" name="borrador" value={borrador} />}
      <p className="text-sm font-medium">Proponer una solución</p>
      {borrador !== null && (
        <p className="card-meta">
          Parte de un borrador del asistente. Puedes cambiarlo antes de publicar.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrador?.(null)}>Quitar borrador</button>
        </p>
      )}
      <div className="form-field">
        <label className="form-label" htmlFor="solucion-title">Título</label>
        <input
          id="solucion-title"
          name="title"
          className="form-input"
          required
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="solucion-description">Descripción</label>
        <textarea
          id="solucion-description"
          name="description"
          className="form-textarea"
          rows={3}
          required
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {aviso}
      <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>Proponer solución</button>
      {state && 'error' in state && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state && 'success' in state && <p className="alert alert-success">Tu solución quedó publicada.</p>}
    </form>
  );
}
