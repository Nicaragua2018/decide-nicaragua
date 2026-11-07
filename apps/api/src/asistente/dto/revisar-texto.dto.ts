import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { TIPOS_TEXTO } from '@decide/shared';
import type { TipoTexto } from '@decide/shared';

export class RevisarTextoDto {
  @IsIn(TIPOS_TEXTO as TipoTexto[], { message: 'Ese tipo de texto no existe.' })
  tipo!: TipoTexto;

  @IsString({ message: 'El texto debe ser texto.' })
  @MinLength(1, { message: 'El texto está vacío.' })
  @MaxLength(5000, { message: 'El texto admite hasta 5000 caracteres.' })
  texto!: string;
}
