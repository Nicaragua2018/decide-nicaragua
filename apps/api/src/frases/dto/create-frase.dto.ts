import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFraseDto {
  /** Se recorta antes de validar: los espacios de relleno no cuentan para el largo. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La frase debe ser texto.' })
  @MinLength(10, { message: 'La frase necesita entre 10 y 140 caracteres.' })
  @MaxLength(140, { message: 'La frase necesita entre 10 y 140 caracteres.' })
  text!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
