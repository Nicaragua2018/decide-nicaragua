import { IsEnum } from 'class-validator';
import { AccountStatus } from '@decide/shared';

/** Estados permitidos como destino en una transición manual (admin). */
const TRANSITIONABLE = [
  AccountStatus.verified_citizen,
  AccountStatus.observer,
  AccountStatus.external_collaborator,
  AccountStatus.rejected,
  AccountStatus.suspended,
] as const;

export class UpdateUserStatusDto {
  @IsEnum(TRANSITIONABLE, {
    message: `status must be one of: ${TRANSITIONABLE.join(', ')}`,
  })
  status!: (typeof TRANSITIONABLE)[number];
}
