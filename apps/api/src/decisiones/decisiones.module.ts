import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsistenteModule } from '../asistente/asistente.module';
import { ForumsModule } from '../forums/forums.module';
import { RulesModule } from '../rules/rules.module';
import { GroupsModule } from '../groups/groups.module';
import { DecisionesService } from './decisiones.service';
import { DecisionesController } from './decisiones.controller';
import { DecisionesScheduler } from './decisiones.scheduler';

@Module({
  imports: [ForumsModule, RulesModule, AuditModule, GroupsModule, AsistenteModule],
  controllers: [DecisionesController],
  providers: [DecisionesService, DecisionesScheduler],
  exports: [DecisionesService],
})
export class DecisionesModule {}
