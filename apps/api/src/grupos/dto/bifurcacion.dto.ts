import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MODERACION_CAUSAS, type ModeracionCausaValue } from '@decide/shared';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class IniciarBifurcacionDto {
  @IsUUID('4', { message: 'Elige una solución válida.' })
  solucionId!: string;
}

export class PausarBifurcacionDto {
  @IsIn(MODERACION_CAUSAS.map((c) => c.value), { message: 'Elige una causa de la lista.' })
  causa!: ModeracionCausaValue;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El detalle debe ser texto.' })
  @MaxLength(500, { message: 'El detalle admite como máximo 500 caracteres.' })
  detalle?: string;
}

export class ApelarPausaDto {
  @Transform(recortar)
  @IsString({ message: 'La apelación debe ser texto.' })
  @MinLength(10, { message: 'La apelación necesita entre 10 y 1000 caracteres.' })
  @MaxLength(1000, { message: 'La apelación necesita entre 10 y 1000 caracteres.' })
  texto!: string;
}

export class ResolverPausaDto {
  @IsBoolean({ message: 'Indica si se reanuda con sí o no.' })
  reanudar!: boolean;
}
