import { IsString, MaxLength, MinLength } from 'class-validator';

export class RespondDto {
  @IsString({ message: 'La respuesta debe ser texto.' })
  @MinLength(50, { message: 'La respuesta necesita entre 50 y 2000 caracteres.' })
  @MaxLength(2000, { message: 'La respuesta necesita entre 50 y 2000 caracteres.' })
  text!: string;
}
