'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface AsistenteContextoValor {
  activo: boolean;
  topeAlcanzado: boolean;
  abierto: boolean;
  abrir(): void;
  cerrar(): void;
}

const Contexto = createContext<AsistenteContextoValor | null>(null);

export function AsistenteProvider({
  activo,
  topeAlcanzado,
  children,
}: {
  activo: boolean;
  topeAlcanzado: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);
  const valor = useMemo(
    () => ({ activo, topeAlcanzado, abierto, abrir, cerrar }),
    [activo, topeAlcanzado, abierto, abrir, cerrar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAsistente(): AsistenteContextoValor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useAsistente debe usarse dentro de AsistenteProvider');
  return valor;
}
