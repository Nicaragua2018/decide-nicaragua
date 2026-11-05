import { IsBoolean } from 'class-validator';

export class ConfirmarModeracionDto {
  /** true: da la segunda firma; false: la rechaza. */
  @IsBoolean({ message: 'Indica si confirmas o rechazas la solicitud.' })
  aprobar!: boolean;
}
