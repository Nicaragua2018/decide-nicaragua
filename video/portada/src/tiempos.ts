// Cuadros (a 30 fps) de cada escena dentro de la composición «Colmena».
export const FPS = 30;
export const DURACION = 1050;

export const ESCENA = {
  dispersos: { desde: 0, hasta: 180 }, // 6 s
  ruido: { desde: 180, hasta: 390 }, // 7 s
  renace: { desde: 390, hasta: 570 }, // 6 s
  multiplica: { desde: 570, hasta: 840 }, // 9 s
  republica: { desde: 840, hasta: 1050 }, // 7 s
} as const;

/** Cuadros que se superponen dos escenas al pasar de una a otra. */
export const FUNDIDO = 20;
