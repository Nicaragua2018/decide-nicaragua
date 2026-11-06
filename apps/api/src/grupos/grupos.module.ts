import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GroupsModule } from '../groups/groups.module';
import { RulesModule } from '../rules/rules.module';
import { GruposService } from './grupos.service';
import { GruposController } from './grupos.controller';
import { GruposScheduler } from './grupos.scheduler';

@Module({
  imports: [RulesModule, AuditModule, GroupsModule],
  controllers: [GruposController],
  providers: [GruposService, GruposScheduler],
  exports: [GruposService],
})
export class GruposModule {}
