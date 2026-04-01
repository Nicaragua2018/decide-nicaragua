import { IsEnum } from 'class-validator';
import { ElectionStatus } from '@decide/shared';

/** Solo el creador puede cambiar el estado. Transiciones permitidas:
 * draft → open | cancelled
 * open  → cancelled
 */
export class UpdateElectionStatusDto {
  @IsEnum([ElectionStatus.open, ElectionStatus.cancelled])
  status!: ElectionStatus.open | ElectionStatus.cancelled;
}
