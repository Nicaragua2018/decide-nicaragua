import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class PapeletaComisionDto {
  @IsArray({ message: 'El orden debe ser una lista de voluntarios.' })
  @ArrayMinSize(1, { message: 'Ordena al menos a un voluntario.' })
  @ArrayMaxSize(200, { message: 'El orden admite como máximo 200 voluntarios.' })
  @IsUUID('4', { each: true, message: 'Cada voluntario del orden debe ser un identificador válido.' })
  orden!: string[];
}
