import { IsBoolean } from 'class-validator';

export class ResolveAppealDto {
  @IsBoolean()
  restore!: boolean;
}
