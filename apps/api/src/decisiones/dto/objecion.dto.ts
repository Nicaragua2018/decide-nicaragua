import { IsBoolean } from 'class-validator';

export class ObjecionDto {
  @IsBoolean({ message: 'Indica si objetas el modo (sí o no).' })
  objeto!: boolean;
}
