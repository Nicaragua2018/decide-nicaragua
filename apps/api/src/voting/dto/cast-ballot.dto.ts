import { IsArray, IsUUID, IsInt, Min, Max, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class RankingInputDto {
  @IsUUID('4')
  candidateId!: string;

  /** Rango de preferencia. 1 = más preferido. Los no incluidos van al último lugar. */
  @IsInt()
  @Min(1)
  @Max(20)  // máximo 20 candidatos por elección (CreateElectionDto.ArrayMaxSize)
  rank!: number;
}

export class CastBallotDto {
  /** No es necesario incluir todos los candidatos. Los omitidos van al último lugar. */
  @IsArray()
  @ArrayMaxSize(20)  // consistente con ArrayMaxSize de CreateElectionDto
  @ValidateNested({ each: true })
  @Type(() => RankingInputDto)
  rankings!: RankingInputDto[];
}
