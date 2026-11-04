import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateInquietudDto {
  @IsUUID('4', { message: 'Elige una comunidad válida.' })
  groupId!: string;

  @IsString({ message: 'El título debe ser texto.' })
  @MinLength(10, { message: 'El título necesita entre 10 y 140 caracteres.' })
  @MaxLength(140, { message: 'El título necesita entre 10 y 140 caracteres.' })
  title!: string;

  @IsString({ message: 'La explicación debe ser texto.' })
  @MaxLength(2000, { message: 'La explicación admite hasta 2000 caracteres.' })
  body!: string;
}
