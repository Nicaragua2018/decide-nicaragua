import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/** Borrador del asistente que la persona adopta como suyo (posición en la lista del tema). */
export class BorradorAdoptadoDto {
  @IsInt({ message: 'Indica qué borrador adoptas.' })
  @Min(0, { message: 'Indica qué borrador adoptas.' })
  @Max(2, { message: 'Indica qué borrador adoptas.' })
  indice!: number;
}

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

  /** Si adopta un borrador del asistente: la solución nace con origen «asistente» y el borrador queda adoptado. */
  @IsOptional()
  @ValidateNested()
  @Type(() => BorradorAdoptadoDto)
  borrador?: BorradorAdoptadoDto;
}
