import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

/** Papeleta de 3A-3: abstención, o las candidaturas aceptadas en orden (vacío = «Rechazo a todas»). */
export class PapeletaEleccionDto {
  @IsBoolean({ message: 'Indica si te abstienes (sí o no).' })
  abstencion!: boolean;

  @IsArray({ message: 'El orden debe ser una lista de candidaturas.' })
  @ArrayMaxSize(100, { message: 'El orden admite como máximo 100 candidaturas.' })
  @IsUUID('4', { each: true, message: 'Cada candidatura del orden debe ser un identificador válido.' })
  orden!: string[];
}
