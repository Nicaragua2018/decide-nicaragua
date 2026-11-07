import { IsBoolean } from 'class-validator';

export class FirmarRevisionDto {
  @IsBoolean({ message: 'Indica si apruebas o rechazas.' })
  aprobar!: boolean;
}
