import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Un informe normal tiene hasta 2000 caracteres; el final, hasta 5000 (se comprueba en el servicio). */
export class InformeComisionDto {
  @Transform(recortar)
  @IsString({ message: 'El informe debe ser texto.' })
  @MinLength(20, { message: 'El informe necesita al menos 20 caracteres.' })
  @MaxLength(5000, { message: 'El informe final puede tener hasta 5000 caracteres.' })
  texto!: string;

  @IsOptional()
  @IsBoolean({ message: 'Indica si es el informe final con sí o no.' })
  final?: boolean;
}
