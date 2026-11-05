import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateSolucionDto {
  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(recortar)
  @IsString({ message: 'La solución debe ser texto.' })
  @MinLength(10, { message: 'El título de la solución necesita entre 10 y 140 caracteres.' })
  @MaxLength(140, { message: 'El título de la solución necesita entre 10 y 140 caracteres.' })
  title!: string;

  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto.' })
  @MinLength(1, { message: 'La descripción necesita entre 1 y 2000 caracteres.' })
  @MaxLength(2000, { message: 'La descripción necesita entre 1 y 2000 caracteres.' })
  description!: string;
}
