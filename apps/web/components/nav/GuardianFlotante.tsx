'use client';

import { Guardian } from '@/components/guardian/Guardian';
import { useAsistente } from '@/components/asistente/AsistenteContexto';

export default function GuardianFlotante() {
  const { activo, abrir } = useAsistente();
  if (!activo) return null;
  return (
    <button
      type="button"
      className="btn-guardian-flotante gd-btn gd-ring"
      aria-label="Pregúntale a Guardián"
      data-guardian-boton=""
      onClick={abrir}
    >
      <Guardian tamano={44} />
    </button>
  );
}
