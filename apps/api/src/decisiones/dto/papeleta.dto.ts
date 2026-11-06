import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class PapeletaDto {
  @IsBoolean({ message: 'Indica si te abstienes (sí o no).' })
  abstencion!: boolean;

  @IsArray({ message: 'El orden debe ser una lista de soluciones.' })
  @ArrayMaxSize(50, { message: 'El orden admite como máximo 50 soluciones.' })
  @IsUUID('4', { each: true, message: 'Cada solución del orden debe ser un identificador válido.' })
  orden!: string[];
}
