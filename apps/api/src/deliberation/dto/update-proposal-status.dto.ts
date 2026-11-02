import { IsIn } from 'class-validator';
import { ProposalStatus } from '@decide/shared';

export class UpdateProposalStatusDto {
  @IsIn([ProposalStatus.open, ProposalStatus.archived], {
    message: 'Para cerrar un tema usa «Cerrar con consenso».',
  })
  status!: ProposalStatus.open | ProposalStatus.archived;
}
