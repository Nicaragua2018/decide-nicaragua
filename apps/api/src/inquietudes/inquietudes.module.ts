import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RulesModule } from '../rules/rules.module';
import { InquietudesService } from './inquietudes.service';
import { InquietudesController } from './inquietudes.controller';

@Module({
  imports: [RulesModule, AuditModule],
  controllers: [InquietudesController],
  providers: [InquietudesService],
  exports: [InquietudesService],
})
export class InquietudesModule {}
