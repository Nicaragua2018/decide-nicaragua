'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { proponerCambioRegla } from '@/lib/actions';

interface Props {
  groupId: string;
  ruleKey: string;
  type: 'int' | 'choice';
  value: string;
  min?: number | undefined;
  max?: number | undefined;
  options?: string[] | undefined;
}

export function ProponerCambio({ groupId, ruleKey, type, value, min, max, options }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(value);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);

  if (proposalId) {
    return (
      <p className="text-sm" role="status">
        Se abrió el debate. La comunidad votará cuando termine.{' '}
        <Link href={`/proposals/${proposalId}`}>Ver el debate</Link>
      </p>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(true)}>
        Proponer un cambio
      </button>
    );
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await proponerCambioRegla(groupId, ruleKey, valor, motivo.trim() || undefined);
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setProposalId(r.proposalId);
      router.refresh();
    });
  }

  const id = `cambio-${ruleKey}`;
  return (
    <form onSubmit={enviar} className="mt-2">
      <label htmlFor={`${id}-valor`} className="text-sm font-medium">Nuevo valor</label>
      {type === 'choice' ? (
        <select id={`${id}-valor`} className="input" value={valor} onChange={(e) => setValor(e.target.value)}>
          {(options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={`${id}-valor`}
            type="number"
            className="input"
            min={min}
            max={max}
            step={1}
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          {min !== undefined && max !== undefined && (
            <p className="text-sm text-muted">entre {min} y {max}</p>
          )}
        </>
      )}
      <label htmlFor={`${id}-motivo`} className="text-sm font-medium">Motivo (opcional)</label>
      <textarea
        id={`${id}-motivo`}
        className="input"
        rows={3}
        maxLength={1000}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Enviando…' : 'Proponer un cambio'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
