'use client';

import { Guardian } from '@/components/guardian/Guardian';
import { useAsistente } from '@/components/asistente/AsistenteContexto';

export default function BotonGuardian() {
  const { activo, abrir } = useAsistente();
  if (!activo) return null;
  return (
    <button type="button" className="btn btn-guardian gd-btn" data-guardian-boton="" onClick={abrir}>
      <span className="btn-guardian-circulo">
        <Guardian tamano={28} />
      </span>
      Pregúntale a Guardián
    </button>
  );
}
