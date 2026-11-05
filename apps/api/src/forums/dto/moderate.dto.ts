import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ModerateDto {
  @IsIn(['tema', 'respuesta', 'inquietud', 'frase'])
  target!: 'tema' | 'respuesta' | 'inquietud' | 'frase';

  @IsUUID('4')
  targetId!: string;

  @IsString()
  @MinLength(10, { message: 'Explica el motivo (al menos 10 caracteres).' })
  @MaxLength(500)
  reason!: string;
}
