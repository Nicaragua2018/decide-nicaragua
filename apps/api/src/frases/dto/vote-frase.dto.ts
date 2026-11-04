import { IsIn } from 'class-validator';
import type { FraseVotoValue } from '@decide/shared';

export class VoteFraseDto {
  @IsIn(['de_acuerdo', 'en_desacuerdo', 'paso'], { message: 'El voto debe ser de acuerdo, en desacuerdo o paso.' })
  value!: FraseVotoValue;
}
