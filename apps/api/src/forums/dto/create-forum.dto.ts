import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateForumDto {
  @IsUUID('4')
  groupId!: string;

  @IsString()
  @MinLength(3, { message: 'El título del foro necesita al menos 3 caracteres.' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
