import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

  /** La persona pide que la mesa revise su texto de nivel 2 (responde 202 y no se publica aún). */
  @IsOptional()
  @IsBoolean({ message: 'Indica si pides la revisión de la mesa con sí o no.' })
  pedirRevision?: boolean;
}
