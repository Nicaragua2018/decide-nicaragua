import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class OpenDebateDto {
  @IsUUID('4', { message: 'Elige una comunidad válida.' })
  groupId!: string;

  @IsArray({ message: 'Elige entre 1 y 10 inquietudes.' })
  @ArrayMinSize(1, { message: 'Elige entre 1 y 10 inquietudes.' })
  @ArrayMaxSize(10, { message: 'Elige entre 1 y 10 inquietudes.' })
  @IsUUID('4', { each: true, message: 'Alguna inquietud no es válida.' })
  inquietudIds!: string[];

  @IsString({ message: 'El título debe ser texto.' })
  @MinLength(10, { message: 'El título necesita entre 10 y 200 caracteres.' })
  @MaxLength(200, { message: 'El título necesita entre 10 y 200 caracteres.' })
  title!: string;

  @IsString({ message: 'El texto debe ser texto.' })
  @MinLength(20, { message: 'El texto necesita entre 20 y 10000 caracteres.' })
  @MaxLength(10_000, { message: 'El texto necesita entre 20 y 10000 caracteres.' })
  body!: string;

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
