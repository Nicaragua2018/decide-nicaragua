import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  /** ID del comentario padre (threading de un nivel). */
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
