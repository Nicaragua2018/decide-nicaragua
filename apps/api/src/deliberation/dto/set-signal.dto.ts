import { IsEnum } from 'class-validator';
import { SignalType } from '@decide/shared';

export class SetSignalDto {
  @IsEnum(SignalType)
  signal!: SignalType;
}
