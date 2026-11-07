/** Resuelve con el valor, o con null si tarda más de `ms` o falla. */
export async function conLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencido = new Promise<null>((resolve) => {
    temporizador = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p.catch(() => null), vencido]);
  } finally {
    clearTimeout(temporizador);
  }
}
