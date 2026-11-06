import { IsIn } from 'class-validator';
import type { DecisionModoValue } from '@decide/shared';

export class ProposeModoDto {
  @IsIn(['excluyentes', 'compatibles'], { message: 'El modo debe ser «excluyentes» o «compatibles».' })
  modo!: DecisionModoValue;
}
