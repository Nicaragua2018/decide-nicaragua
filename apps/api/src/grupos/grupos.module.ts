import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ForumsModule } from '../forums/forums.module';
import { GroupsModule } from '../groups/groups.module';
import { RulesModule } from '../rules/rules.module';
import { GruposService } from './grupos.service';
import { ComisionesService } from './comisiones.service';
import { GruposController } from './grupos.controller';
import { GruposScheduler } from './grupos.scheduler';

@Module({
  imports: [RulesModule, AuditModule, GroupsModule, ForumsModule],
  controllers: [GruposController],
  providers: [GruposService, ComisionesService, GruposScheduler],
  exports: [GruposService],
})
export class GruposModule {}
