'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { openDebate } from '@/lib/actions';
import { useFormConRevision } from '@/components/RevisarAntesDePublicar';

export interface AgendaItem {
  id: string;
  title: string;
  supportCount: number;
  threshold: number;
  deadline: string | null;
}

interface Relleno {
  marcadas: string[];
  title: string;
  body: string;
  setMarcadas: (ids: string[]) => void;
  setTitle: (t: string) => void;
  setBody: (b: string) => void;
}

const RellenoContext = createContext<Relleno | null>(null);

/** Guarda lo que lleva el formulario del debate, para que la tarjeta de «Inquietudes parecidas» lo rellene. */
export function DebateRellenable({ children }: { children: ReactNode }) {
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <RellenoContext.Provider value={{ marcadas, title, body, setMarcadas, setTitle, setBody }}>
      {children}
    </RellenoContext.Provider>
  );
}

/** Botón «Juntar en un debate»: solo rellena el formulario; quien organiza lo revisa y lo envía. */
export function JuntarEnDebate({ ids, title, body }: { ids: string[]; title: string; body: string }) {
  const r = useContext(RellenoContext);
  if (!r) return null;
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm mt-2"
      onClick={() => {
        r.setMarcadas(ids);
        r.setTitle(title.slice(0, 200));
        r.setBody(body.slice(0, 10000));
        document.getElementById('abrir-debate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
    >
      Juntar en un debate
    </button>
  );
}

export function OpenDebateForm({ groupId, items }: { groupId: string; items: AgendaItem[] }) {
  const r = useContext(RellenoContext);
  const [marcadasLocal, setMarcadasLocal] = useState<string[]>([]);
  const [titleLocal, setTitleLocal] = useState('');
  const [bodyLocal, setBodyLocal] = useState('');
  const marcadas = r?.marcadas ?? marcadasLocal;
  const setMarcadas = r?.setMarcadas ?? setMarcadasLocal;
  const title = r?.title ?? titleLocal;
  const setTitle = r?.setTitle ?? setTitleLocal;
  const body = r?.body ?? bodyLocal;
  const setBody = r?.setBody ?? setBodyLocal;
  const { formRef, formAction, onSubmit, state, ocupado, aviso } = useFormConRevision({
    tipo: 'tema',
    accion: openDebate,
    campos: ['title', 'body'],
    campoSugerencia: 'body',
    alUsarSugerencia: setBody,
    alUsarTitulo: setTitle,
    reiniciar: false,
  });
  return (
    <form id="abrir-debate" ref={formRef} action={formAction} onSubmit={onSubmit} className="form">
      <input type="hidden" name="groupId" value={groupId} />
      {items.map((q) => (
        <label key={q.id} className="flex gap-2 items-center">
          <input
            type="checkbox"
            name="inquietudIds"
            value={q.id}
            checked={marcadas.includes(q.id)}
            onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, q.id] : marcadas.filter((x) => x !== q.id))}
          />
          <span>
            {q.title}
            <small className="text-muted">
              {' '}· {q.supportCount} apoyos de {q.threshold} necesarios
              {q.deadline ? ` · plazo ${q.deadline}` : ''}
            </small>
          </span>
        </label>
      ))}
      <input
        name="title"
        className="form-input"
        required
        minLength={10}
        maxLength={200}
        placeholder="Título del debate"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        name="body"
        className="form-textarea"
        rows={4}
        required
        minLength={20}
        maxLength={10000}
        placeholder="Planteamiento del debate"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {aviso}
      <button className="btn btn-primary" disabled={ocupado}>Abrir debate con las inquietudes marcadas</button>
      <p className="text-xs text-muted">Marca una o varias inquietudes de esta comunidad.</p>
      {state && 'error' in state && <p className="alert alert-error">{state.error}</p>}
    </form>
  );
}
