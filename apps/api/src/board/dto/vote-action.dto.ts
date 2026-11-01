import { IsBoolean } from 'class-validator';

export class VoteActionDto {
  @IsBoolean()
  approve!: boolean;
}
