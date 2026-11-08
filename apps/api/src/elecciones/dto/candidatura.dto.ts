import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMPROMISO_MAX, COMPROMISOS_MAX, PRESENTACION_MAX } from '@decide/shared';

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const recortarCada = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value;

/** La ficha de quien se presenta: igual para todas las candidaturas. */
export class CandidaturaDto {
  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(recortar)
  @IsString({ message: 'La presentación debe ser texto.' })
  @MinLength(1, { message: `La presentación necesita entre 1 y ${PRESENTACION_MAX} caracteres.` })
  @MaxLength(PRESENTACION_MAX, { message: `La presentación necesita entre 1 y ${PRESENTACION_MAX} caracteres.` })
  presentacion!: string;

  @Transform(recortarCada)
  @IsArray({ message: 'Los compromisos deben ser una lista.' })
  @ArrayMaxSize(COMPROMISOS_MAX, { message: `Puedes escribir hasta ${COMPROMISOS_MAX} compromisos.` })
  @IsString({ each: true, message: 'Cada compromiso debe ser texto.' })
  @MinLength(1, { each: true, message: `Cada compromiso necesita entre 1 y ${COMPROMISO_MAX} caracteres.` })
  @MaxLength(COMPROMISO_MAX, { each: true, message: `Cada compromiso necesita entre 1 y ${COMPROMISO_MAX} caracteres.` })
  compromisos!: string[];

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
