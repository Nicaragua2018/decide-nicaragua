import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class VoluntarioDto {
  /** Experiencia relacionada, opcional; se recorta antes de validar. */
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La experiencia debe ser texto.' })
  @MaxLength(500, { message: 'La experiencia admite como máximo 500 caracteres.' })
  experiencia?: string;
}
