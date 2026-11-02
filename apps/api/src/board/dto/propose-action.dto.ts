import { IsIn, IsObject, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { BoardActionType } from '@decide/shared';

export class ProposeActionDto {
  @IsIn(Object.values(BoardActionType), { message: 'Tipo de acción no válido' })
  type!: BoardActionType;

  @IsUUID('4')
  targetUserId!: string;

  @IsString()
  @MinLength(3, { message: 'Escribe el motivo (al menos 3 caracteres)' })
  @MaxLength(500)
  reason!: string;

  @IsObject()
  params!: Record<string, unknown>;
}
