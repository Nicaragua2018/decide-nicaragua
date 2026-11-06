import { IsUUID } from 'class-validator';

export class LlevarPropuestaDto {
  @IsUUID('4', { message: 'Elige una propuesta válida.' })
  solucionId!: string;
}
