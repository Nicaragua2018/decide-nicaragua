import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateInquietudDto {
  @IsUUID('4')
  groupId!: string;

  @IsString()
  @MinLength(10, { message: 'El título necesita entre 10 y 140 caracteres.' })
  @MaxLength(140, { message: 'El título necesita entre 10 y 140 caracteres.' })
  title!: string;

  @IsString()
  @MaxLength(2000, { message: 'La explicación admite hasta 2000 caracteres.' })
  body!: string;
}
