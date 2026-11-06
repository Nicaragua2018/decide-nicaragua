import { IsUUID } from 'class-validator';

export class MergeSolucionDto {
  @IsUUID('4', { message: 'Indica la solución con la que se junta.' })
  intoId!: string;
}
