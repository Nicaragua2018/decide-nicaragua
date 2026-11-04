import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFraseDto {
  @IsString({ message: 'La frase debe ser texto.' })
  @MinLength(10, { message: 'La frase necesita entre 10 y 140 caracteres.' })
  @MaxLength(140, { message: 'La frase necesita entre 10 y 140 caracteres.' })
  text!: string;
}
