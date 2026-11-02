import { IsIn, IsUUID } from 'class-validator';
import { BOARD_ROLES, type BoardRole } from '@decide/shared';

export class AssignSeatDto {
  @IsIn(BOARD_ROLES, { message: 'Cargo no válido' })
  role!: BoardRole;

  @IsUUID('4')
  profileId!: string;
}
