import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class ProponerCambioDto {
  @IsUUID('4', { message: 'Elige una comunidad válida.' })
  groupId!: string;

  @IsString({ message: 'Elige una regla.' })
  @MaxLength(80, { message: 'Elige una regla.' })
  key!: string;

  /** Siempre texto: el servicio lo valida según el tipo de la regla (entero u opción). */
  @IsString({ message: 'El valor debe ser texto.' })
  @MaxLength(40, { message: 'El valor admite hasta 40 caracteres.' })
  valor!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El motivo debe ser texto.' })
  @MaxLength(1000, { message: 'El motivo admite hasta 1000 caracteres.' })
  motivo?: string;
}
