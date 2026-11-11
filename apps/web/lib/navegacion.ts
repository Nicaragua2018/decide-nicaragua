export type OpcionNav = { titulo: string; ruta: string; ayuda: string };
export type BloqueId = 'participar' | 'comunidad' | 'transparencia';
export type BloqueNav = { id: BloqueId; titulo: string; opciones: OpcionNav[] };

type Requiere = 'verificado' | 'observador' | null;
type Entrada = OpcionNav & { bloque: BloqueId; requiere: Requiere };

const BLOQUES: { id: BloqueId; titulo: string }[] = [
  { id: 'participar', titulo: 'Participar' },
  { id: 'comunidad', titulo: 'Comunidad' },
  { id: 'transparencia', titulo: 'Transparencia' },
];

// Tabla del spec §5.2 (orden y textos exactos).
const OPCIONES: Entrada[] = [
  { bloque: 'participar', titulo: 'Inquietudes', ruta: '/inquietudes', ayuda: 'Las preguntas que la comunidad apoya', requiere: 'verificado' },
  { bloque: 'participar', titulo: 'Foros', ruta: '/foros', ayuda: 'Debates abiertos por tema', requiere: 'verificado' },
  { bloque: 'participar', titulo: 'Decisiones', ruta: '/decisiones', ayuda: 'Votaciones, consensos y resultados', requiere: 'verificado' },
  { bloque: 'participar', titulo: 'Grupos de trabajo', ruta: '/grupos', ayuda: 'Comisiones que llevan una decisión a la práctica', requiere: 'verificado' },
  { bloque: 'comunidad', titulo: 'Mis comunidades', ruta: '/dashboard', ayuda: 'Exilio y diáspora, origen y acogida', requiere: null },
  { bloque: 'comunidad', titulo: 'Elecciones', ruta: '/elecciones', ayuda: 'Campañas, candidaturas y sorteos', requiere: 'verificado' },
  { bloque: 'comunidad', titulo: 'Mesa', ruta: '/admin/mesa', ayuda: 'Lo que toca ahora para que la comunidad arranque', requiere: 'verificado' },
  { bloque: 'comunidad', titulo: 'Observar', ruta: '/observar', ayuda: 'Aparece solo si tienes el cargo', requiere: 'observador' },
  { bloque: 'transparencia', titulo: 'Reglas', ruta: '/reglas', ayuda: 'Cómo funciona la plataforma, en claro', requiere: null },
  { bloque: 'transparencia', titulo: 'Verificaciones', ruta: '/verificaciones', ayuda: 'Quién está verificado y cómo', requiere: null },
  { bloque: 'transparencia', titulo: 'Auditoría', ruta: '/audit', ayuda: 'Registro público de cada acción', requiere: null },
];

// Rutas sin opción propia que también pertenecen a un bloque (§5.2 / Interfaces).
const PREFIJOS_EXTRA: { prefijo: string; bloque: BloqueId }[] = [
  { prefijo: '/groups', bloque: 'comunidad' },
  { prefijo: '/elections', bloque: 'comunidad' },
  { prefijo: '/proposals', bloque: 'participar' },
];

export function bloquesDeNavegacion(p: { status: string; esObservador: boolean }): BloqueNav[] {
  const verificado = p.status === 'verified_citizen';
  const visible = (e: Entrada) =>
    e.requiere === null ||
    (e.requiere === 'verificado' && verificado) ||
    (e.requiere === 'observador' && p.esObservador);

  return BLOQUES.map((b) => ({
    id: b.id,
    titulo: b.titulo,
    opciones: OPCIONES.filter((e) => e.bloque === b.id && visible(e)).map(({ titulo, ruta, ayuda }) => ({ titulo, ruta, ayuda })),
  })).filter((b) => b.opciones.length > 0);
}

export function bloqueActivo(pathname: string, bloques: BloqueNav[]): BloqueId | null {
  for (const b of bloques) {
    for (const o of b.opciones) {
      if (pathname === o.ruta || pathname.startsWith(o.ruta + '/')) return b.id;
    }
  }
  for (const { prefijo, bloque } of PREFIJOS_EXTRA) {
    if (pathname === prefijo || pathname.startsWith(prefijo + '/')) return bloque;
  }
  return null;
}

export type OpcionAvatar = { titulo: string; ruta: string; etiqueta?: 'admin' };

export function opcionesDeAvatar(p: { status: string }): OpcionAvatar[] {
  const opciones: OpcionAvatar[] = [{ titulo: 'Mi perfil', ruta: '/me' }];
  if (p.status === 'verified_citizen') {
    opciones.push({ titulo: 'Administración', ruta: '/admin/users', etiqueta: 'admin' });
  }
  return opciones;
}
