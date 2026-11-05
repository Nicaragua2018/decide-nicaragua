import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MODERACION_CAUSAS, type ModeracionCausaValue } from '@decide/shared';

export class ModerateDto {
  @IsIn(['tema', 'respuesta', 'inquietud', 'frase', 'solucion'])
  target!: 'tema' | 'respuesta' | 'inquietud' | 'frase' | 'solucion';

  @IsUUID('4')
  targetId!: string;

  @IsIn(MODERACION_CAUSAS.map((c) => c.value), { message: 'Elige una causa de la lista.' })
  causa!: ModeracionCausaValue;

  /** Detalle opcional; se recorta antes de validar. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El detalle debe ser texto.' })
  @MaxLength(500, { message: 'El detalle puede tener hasta 500 caracteres.' })
  reason?: string;
}
