import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RulesModule } from '../rules/rules.module';
import { ConvocatoriaService } from './convocatoria.service';
import { PosesionService } from './posesion.service';
import { EleccionesScheduler } from './elecciones.scheduler';

@Module({
  imports: [RulesModule, AuditModule],
  providers: [ConvocatoriaService, PosesionService, EleccionesScheduler],
  exports: [ConvocatoriaService, PosesionService],
})
export class EleccionesModule {}
