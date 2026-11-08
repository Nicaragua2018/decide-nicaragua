/** Elecciones y cargos: tipos y límites compartidos entre API y web. */

export type CargoTipoValue = 'administrador' | 'coordinador_general' | 'secretario' | 'observador' | 'coordinador';
export type EleccionFaseValue = 'candidaturas' | 'votacion' | 'contada';
export type EleccionMotivoValue = 'primera' | 'renovacion' | 'reintento';

export const CARGO_ETIQUETA: Record<CargoTipoValue, string> = {
  administrador: 'Administración',
  coordinador_general: 'Coordinación general',
  secretario: 'Secretaría',
  observador: 'Observadores',
  coordinador: 'Coordinación de la comunidad',
};

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
  filas: { candidaturaId: string; nombre: string; aprobacionesPct: number; electa: boolean }[];
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
  resultado: ResultadoEleccionVista | null;
};

export type RepresentantesVista = {
  mesa: { tipo: CargoTipoValue; nombre: string; iniciales: string; desde: string; hasta: string; enFunciones: boolean; fundador: boolean }[];
  observadores: { nombre: string; iniciales: string; desde: string; hasta: string }[];
  comunidades: {
    id: string;
    nombre: string;
    activa: boolean;
    coordinadores: { nombre: string; iniciales: string; desde: string; hasta: string; enFunciones: boolean }[];
    eleccionAbierta: boolean;
  }[];
};
