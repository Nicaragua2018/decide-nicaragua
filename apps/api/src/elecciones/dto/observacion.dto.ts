import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { OBSERVACION_MAX } from '@decide/shared';

export const OBSERVACION_MIN = 10;

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const LARGO = `La observación necesita entre ${OBSERVACION_MIN} y ${OBSERVACION_MAX} caracteres.`;

/** Una observación pública sobre un hecho del registro de auditoría. */
export class ObservacionDto {
  @IsUUID('all', { message: 'Indica el evento del registro que observas.' })
  auditEventId!: string;

  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(recortar)
  @IsString({ message: 'La observación debe ser texto.' })
  @MinLength(OBSERVACION_MIN, { message: LARGO })
  @MaxLength(OBSERVACION_MAX, { message: LARGO })
  texto!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
