import { IsString, MaxLength, MinLength } from 'class-validator';

export class AppealDto {
  @IsString()
  @MinLength(10, { message: 'Explica tu apelación (al menos 10 caracteres).' })
  @MaxLength(1000)
  text!: string;
}
