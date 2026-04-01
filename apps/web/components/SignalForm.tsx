'use client';

import { useTransition } from 'react';
import { setSignal } from '@/lib/actions';
import { SignalType } from '@decide/shared';

const SIGNALS: { type: SignalType; label: string; activeClass: string }[] = [
  { type: SignalType.support, label: '✓ Apoyo',    activeClass: 'signal-btn-active-support' },
  { type: SignalType.neutral, label: '◆ Neutral',  activeClass: 'signal-btn-active-neutral' },
  { type: SignalType.object,  label: '✗ Objeción', activeClass: 'signal-btn-active-object'  },
];

interface SignalFormProps {
  proposalId: string;
  currentSignal: SignalType | null;
  isOpen: boolean;
}

export default function SignalForm({ proposalId, currentSignal, isOpen }: SignalFormProps) {
  const [isPending, startTransition] = useTransition();

  if (!isOpen) {
    return <p className="text-sm text-muted">La propuesta no está abierta para señales.</p>;
  }

  function handleSignal(signal: SignalType) {
    startTransition(() => {
      void setSignal(proposalId, signal);
    });
  }

  return (
    <div className="signal-bar">
      {SIGNALS.map(({ type, label, activeClass }) => (
        <button
          key={type}
          onClick={() => handleSignal(type)}
          disabled={isPending}
          className={`signal-btn${currentSignal === type ? ` ${activeClass}` : ''}`}
        >
          {label}
        </button>
      ))}
      {isPending && <span className="text-xs text-muted">Guardando…</span>}
    </div>
  );
}
