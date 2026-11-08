import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsistenteModule } from '../asistente/asistente.module';
import { BoardModule } from '../board/board.module';
import { RulesModule } from '../rules/rules.module';
import { ConvocatoriaService } from './convocatoria.service';
import { PosesionService } from './posesion.service';
import { RevocacionService } from './revocacion.service';
import { EleccionesScheduler } from './elecciones.scheduler';
import { EleccionesService } from './elecciones.service';
import { EleccionesController, RepresentantesController } from './elecciones.controller';

@Module({
  imports: [RulesModule, AuditModule, AsistenteModule, BoardModule],
  controllers: [EleccionesController, RepresentantesController],
  providers: [ConvocatoriaService, PosesionService, RevocacionService, EleccionesScheduler, EleccionesService],
  exports: [ConvocatoriaService, PosesionService, RevocacionService, EleccionesService],
})
export class EleccionesModule {}
