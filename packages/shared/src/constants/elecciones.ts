/** Elecciones y cargos: tipos y límites compartidos entre API y web. */

export type CargoTipoValue = 'administrador' | 'coordinador_general' | 'secretario' | 'observador' | 'coordinador';
export type EleccionFaseValue = 'candidaturas' | 'votacion' | 'contada';
export type EleccionMotivoValue = 'primera' | 'renovacion' | 'reintento' | 'anticipada';
/** Por qué terminó un cargo antes o al final de su período. */
export type CargoFinValue = 'mandato' | 'renuncia' | 'revocacion' | 'suspension';

export const CARGO_ETIQUETA: Record<CargoTipoValue, string> = {
  administrador: 'Administración',
  coordinador_general: 'Coordinación general',
  secretario: 'Secretaría',
  observador: 'Observadores',
  coordinador: 'Coordinación de la comunidad',
};

export const REVOCACION_PLAZO_DIAS = 14;
export const REVOCACION_ESPERA_DIAS = 60;
export const REACTIVACION_ESPERA_DIAS = 30;
export const ANTICIPADA_MINIMO_DIAS = 45;
export const MOTIVO_REVOCACION_MAX = 600;
export const TEXTO_REACTIVACION_MAX = 1000;
export const OBSERVACION_MAX = 1000;

export const PRESENTACION_MAX = 600;
export const COMPROMISOS_MAX = 3;
export const COMPROMISO_MAX = 140;

export type CandidaturaVista = {
  id: string;
  nombre: string;
  iniciales: string;
  comunidades: string;
  presentacion: string;
  compromisos: string[];
  esMia: boolean;
};

export type ResultadoEleccionVista = {
  electas: { candidaturaId: string; nombre: string; iniciales: string; lugar: number }[];
  vacantes: number;
  sinQuorum: boolean;
  papeletasTotal: number;
  abstenciones: number;
  miembros: number;
  /**
   * Cifras exactas tras el conteo (las matrices ya son públicas): `aparece` es en cuántas papeletas
   * sin abstención aparece la persona; `validas`, cuántas papeletas no se abstuvieron.
   */
  filas: { candidaturaId: string; nombre: string; aparece: number; validas: number; electa: boolean }[];
  /** `gana` y `pierde` son ids de candidatura (los nombres están en `filas`). */
  duelos: { gana: string; pierde: string; aFavor: number; enContra: number }[];
  candidatasOrden: string[];
  pairwiseMatrix: number[][];
  schulzeMatrix: number[][];
  semilla: string | null;
};

export type EleccionResumen = {
  id: string;
  cargo: CargoTipoValue;
  ambito: { id: string; nombre: string };
  puestos: number;
  fase: EleccionFaseValue;
  motivo: EleccionMotivoValue;
  candidaturasEndsAt: string;
  votacionEndsAt: string;
  jornadaId: string | null;
  puedoPresentarme: boolean;
  yaVote: boolean;
  /** Participación redondeada de 5 en 5 durante la votación; null si no se muestra. */
  participacionAprox: number | null;
};

export type EleccionDetalle = EleccionResumen & {
  candidaturas: CandidaturaVista[];
  miPapeleta: { abstencion: boolean; orden: string[] } | null;
  /** La candidatura viva propia, también si la mesa la ocultó (solo la ve quien se presentó). */
  miCandidatura: { ficha: CandidaturaVista; oculta: boolean; aviso: string | null } | null;
  resultado: ResultadoEleccionVista | null;
};

/** Un cargo propio vigente (o por empezar), para «Mis cargos». */
export type MiCargoVista = {
  id: string;
  tipo: CargoTipoValue;
  comunidad: string | null;
  desde: string;
  hasta: string | null;
  enFunciones: boolean;
  puedeRenunciar: boolean;
};

/** Un pedido de revocación abierto, visto por quien puede apoyarlo. */
export type RevocacionVista = {
  id: string;
  cargoId: string;
  tipo: CargoTipoValue;
  persona: string;
  comunidad: string | null;
  motivo: string;
  apoyos: number;
  umbral: number;
  venceAt: string;
  apoyaste: boolean;
  puedoApoyar: boolean;
};

/** Cuánto apoyo lleva el pedido de revocación abierto de un cargo. */
export type RevocacionResumen = { apoyos: number; umbral: number; venceAt: string };

/** Una observación pública sobre un hecho del registro de la plataforma. */
export type ObservacionVista = {
  id: string;
  autor: string;
  iniciales: string;
  texto: string;
  evento: { action: string; createdAt: string };
  createdAt: string;
};

/** Lo que ve una persona suspendida: su caso y, si existe, su solicitud de reactivación. */
export type CasoSuspension = {
  motivo: string;
  suspendidaAt: string;
  solicitud: { estado: 'pendiente' | 'aprobada' | 'rechazada'; motivoRechazo: string | null; createdAt: string } | null;
  puedePedirDesde: string | null;
};

export type RepresentantesVista = {
  /** `hasta` es null en un asiento fundador: no tiene período, sigue en funciones hasta su elección. */
  mesa: { tipo: CargoTipoValue; nombre: string; iniciales: string; desde: string; hasta: string | null; enFunciones: boolean; fundador: boolean; cargoId: string | null; revocacion: RevocacionResumen | null }[];
  observadores: { nombre: string; iniciales: string; desde: string; hasta: string; cargoId: string | null; revocacion: RevocacionResumen | null }[];
  comunidades: {
    id: string;
    nombre: string;
    activa: boolean;
    coordinadores: { nombre: string; iniciales: string; desde: string; hasta: string; enFunciones: boolean; cargoId: string | null; revocacion: RevocacionResumen | null }[];
    eleccionAbierta: boolean;
  }[];
  observaciones: ObservacionVista[];
};
