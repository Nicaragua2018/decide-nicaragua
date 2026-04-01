import { IsEnum } from 'class-validator';
import { ProposalStatus } from '@decide/shared';

export class UpdateProposalStatusDto {
  @IsEnum([ProposalStatus.closed, ProposalStatus.archived])
  status!: ProposalStatus.closed | ProposalStatus.archived;
}
