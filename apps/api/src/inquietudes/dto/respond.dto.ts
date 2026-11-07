import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RespondDto {
  @IsString({ message: 'La respuesta debe ser texto.' })
  @MinLength(50, { message: 'La respuesta necesita entre 50 y 2000 caracteres.' })
  @MaxLength(2000, { message: 'La respuesta necesita entre 50 y 2000 caracteres.' })
  text!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
