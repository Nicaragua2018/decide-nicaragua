import { IsString, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  /** ID del comentario padre (threading de un nivel). */
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
