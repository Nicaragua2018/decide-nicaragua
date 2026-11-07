import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
