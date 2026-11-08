import { IsIn, IsObject, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { BoardActionType } from '@decide/shared';

export class ProposeActionDto {
  @IsIn(Object.values(BoardActionType), { message: 'Tipo de acción no válido' })
  type!: BoardActionType;

  /** En ocultar_candidatura la persona objetivo sale de la candidatura (no hace falta enviarla). */
  @ValidateIf((o: ProposeActionDto) => o.type !== BoardActionType.ocultar_candidatura)
  @IsUUID('4')
  targetUserId?: string;

  @IsString()
  @MinLength(3, { message: 'Escribe el motivo (al menos 3 caracteres)' })
  @MaxLength(500)
  reason!: string;

  @IsObject()
  params!: Record<string, unknown>;
}
