import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CandidateInputDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class CreateElectionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** ISO 8601. Debe ser anterior a endsAt. */
  @IsDateString()
  startsAt!: string;

  /** ISO 8601. Debe ser posterior a startsAt. */
  @IsDateString()
  endsAt!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CandidateInputDto)
  candidates!: CandidateInputDto[];
}
