import { IsString, MaxLength, MinLength } from 'class-validator';
import { TEXTO_REACTIVACION_MAX } from '@decide/shared';

/** Un JWT firmado es corto; el tope solo evita cuerpos enormes. */
const TOKEN_MAX = 2048;

export class CasoReactivacionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TOKEN_MAX)
  token!: string;
}

export class PedirReactivacionDto extends CasoReactivacionDto {
  @IsString()
  @MinLength(10, { message: 'Escribe al menos 10 caracteres.' })
  @MaxLength(TEXTO_REACTIVACION_MAX, { message: `Escribe como mucho ${TEXTO_REACTIVACION_MAX.toString()} caracteres.` })
  texto!: string;
}
