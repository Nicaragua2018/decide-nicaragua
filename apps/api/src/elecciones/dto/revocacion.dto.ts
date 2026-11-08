import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MOTIVO_REVOCACION_MAX } from '@decide/shared';

export const MOTIVO_REVOCACION_MIN = 10;

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const LARGO = `El motivo necesita entre ${MOTIVO_REVOCACION_MIN} y ${MOTIVO_REVOCACION_MAX} caracteres.`;

/** El pedido de revocación de un cargo: por qué se pide. */
export class RevocacionDto {
  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(recortar)
  @IsString({ message: 'El motivo debe ser texto.' })
  @MinLength(MOTIVO_REVOCACION_MIN, { message: LARGO })
  @MaxLength(MOTIVO_REVOCACION_MAX, { message: LARGO })
  motivo!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
