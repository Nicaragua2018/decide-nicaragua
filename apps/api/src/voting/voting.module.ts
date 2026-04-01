import { Module } from '@nestjs/common';
import { VotingService } from './voting.service';
import { VotingController } from './voting.controller';
import { AuditModule } from '../audit/audit.module';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  imports: [AuditModule],
  controllers: [VotingController],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
