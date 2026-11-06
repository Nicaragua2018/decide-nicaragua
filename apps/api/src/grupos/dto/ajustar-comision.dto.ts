import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Los límites de `puestos` dependen de las reglas del ámbito; se comprueban en el servicio. */
export class AjustarComisionDto {
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La tarea debe ser texto.' })
  @MinLength(20, { message: 'La tarea necesita entre 20 y 2000 caracteres.' })
  @MaxLength(2000, { message: 'La tarea necesita entre 20 y 2000 caracteres.' })
  tarea?: string;

  @IsOptional()
  @IsInt({ message: 'Los puestos deben ser un número entero.' })
  puestos?: number;
}
