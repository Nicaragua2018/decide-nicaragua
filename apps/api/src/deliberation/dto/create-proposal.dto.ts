import { IsString, IsEnum, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ProposalStatus } from '@decide/shared';

export class CreateProposalDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(10_000)
  body!: string;

  /** Por defecto 'open'. Permite crear borradores enviando 'draft'. */
  @IsOptional()
  @IsEnum([ProposalStatus.draft, ProposalStatus.open])
  status?: ProposalStatus.draft | ProposalStatus.open;

  /** Foro donde se abre el tema; por defecto, el foro por defecto del grupo. */
  @IsOptional()
  @IsUUID('4')
  forumId?: string;
}
