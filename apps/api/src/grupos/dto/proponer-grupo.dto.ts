import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ProponerGrupoDto {
  @IsUUID('4', { message: 'Elige una comunidad válida.' })
  ambitoId!: string;

  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto.' })
  @MinLength(5, { message: 'El nombre necesita entre 5 y 80 caracteres.' })
  @MaxLength(80, { message: 'El nombre necesita entre 5 y 80 caracteres.' })
  name!: string;

  @Transform(recortar)
  @IsString({ message: 'El propósito debe ser texto.' })
  @MinLength(20, { message: 'El propósito necesita entre 20 y 1000 caracteres.' })
  @MaxLength(1000, { message: 'El propósito necesita entre 20 y 1000 caracteres.' })
  proposito!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
