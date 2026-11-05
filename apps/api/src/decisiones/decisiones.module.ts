import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ForumsModule } from '../forums/forums.module';
import { RulesModule } from '../rules/rules.module';
import { DecisionesService } from './decisiones.service';
import { DecisionesController } from './decisiones.controller';

@Module({
  imports: [ForumsModule, RulesModule, AuditModule],
  controllers: [DecisionesController],
  providers: [DecisionesService],
  exports: [DecisionesService],
})
export class DecisionesModule {}
