import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { MensajePanel } from '@decide/shared';

export class MensajePanelDto implements MensajePanel {
  @IsIn(['persona', 'asistente'], { message: 'Ese autor no existe.' })
  rol!: 'persona' | 'asistente';

  @IsString({ message: 'El mensaje debe ser texto.' })
  @MinLength(1, { message: 'El mensaje está vacío.' })
  @Matches(/\S/, { message: 'El mensaje está vacío.' })
  @MaxLength(1000, { message: 'Cada mensaje admite hasta 1000 caracteres.' })
  texto!: string;
}

export class PreguntarDto {
  @IsArray({ message: 'La conversación debe ser una lista.' })
  @ArrayMinSize(1, { message: 'Escribe tu pregunta.' })
  @ArrayMaxSize(12, { message: 'La conversación admite hasta 12 mensajes.' })
  @ValidateNested({ each: true })
  @Type(() => MensajePanelDto)
  mensajes!: MensajePanelDto[];
}
