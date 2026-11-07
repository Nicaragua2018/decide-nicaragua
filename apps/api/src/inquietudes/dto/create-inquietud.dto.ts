import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
