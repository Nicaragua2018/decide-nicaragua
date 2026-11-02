import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GroupsModule } from '../groups/groups.module';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [AuditModule, GroupsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
