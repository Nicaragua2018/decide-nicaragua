import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliberationModule } from '../deliberation/deliberation.module';
import { GroupsModule } from '../groups/groups.module';
import { RulesModule } from './rules.module';
import { CambiosReglaService } from './cambios-regla.service';
import { CambiosReglaController } from './cambios-regla.controller';

/**
 * Cambios de regla por votación. Va aparte de RulesModule: este necesita DeliberationModule
 * (que, vía ForumsModule, ya importa RulesModule), y meterlo ahí cerraría un ciclo de módulos.
 */
@Module({
  imports: [RulesModule, DeliberationModule, GroupsModule, AuditModule],
  controllers: [CambiosReglaController],
  providers: [CambiosReglaService],
  exports: [CambiosReglaService],
})
export class CambiosReglaModule {}
