import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}
