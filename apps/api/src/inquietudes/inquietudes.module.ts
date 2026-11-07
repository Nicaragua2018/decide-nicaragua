import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsistenteModule } from '../asistente/asistente.module';
import { DeliberationModule } from '../deliberation/deliberation.module';
import { ForumsModule } from '../forums/forums.module';
import { RulesModule } from '../rules/rules.module';
import { InquietudesService } from './inquietudes.service';
import { InquietudesController } from './inquietudes.controller';
import { InquietudesScheduler } from './inquietudes.scheduler';

@Module({
  imports: [RulesModule, AuditModule, ForumsModule, DeliberationModule, AsistenteModule],
  controllers: [InquietudesController],
  providers: [InquietudesService, InquietudesScheduler],
  exports: [InquietudesService],
})
export class InquietudesModule {}
