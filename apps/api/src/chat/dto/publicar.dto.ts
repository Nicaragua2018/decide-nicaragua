import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CHAT_MAX } from '@decide/shared';

export class PublicarDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El mensaje debe ser texto.' })
  @IsNotEmpty({ message: 'Escribe un mensaje.' })
  @MaxLength(CHAT_MAX, { message: `El mensaje puede tener hasta ${CHAT_MAX.toString()} caracteres.` })
  texto!: string;

  /** true cuando se envía con el botón «Preguntar a Guardián». */
  @IsOptional()
  @IsBoolean({ message: 'Indica si llamas a Guardián.' })
  llamarGuardian?: boolean;
}
