import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AuditModule } from '../audit/audit.module';
import { BoardModule } from '../board/board.module';
import { EmailModule } from '../email/email.module';
import { ForumsModule } from '../forums/forums.module';
import { GroupsModule } from '../groups/groups.module';
import { RulesModule } from '../rules/rules.module';
import { VerificationModule } from '../verification/verification.module';
import { AsistenteController } from './asistente.controller';
import { RevisionesController } from './revisiones.controller';
import { RevisionesService } from './revisiones.service';
import { ContextoPersonaService } from './contexto-persona.service';
import { AsistenteScheduler } from './asistente.scheduler';
import { ANTHROPIC_CLIENT, AsistenteService } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { GuardiaService } from './guardia.service';
import { PanelService } from './panel.service';
import { AlDiaService } from './al-dia.service';
import { CrecerService } from './crecer.service';
import { Publicadores } from './publicadores';
import { RevisionPosteriorService } from './revision-posterior.service';
import { SemillasService } from './semillas.service';
import { SugerenciasService } from './sugerencias.service';
import { AcuerdosService } from './acuerdos.service';

@Module({
  imports: [AuditModule, EmailModule, BoardModule, ForumsModule, GroupsModule, RulesModule, VerificationModule],
  controllers: [AsistenteController, RevisionesController],
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      // Sin clave no hay cliente: el asistente queda apagado, nunca falla al arrancar.
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) return null;
        try {
          return new Anthropic({ apiKey });
        } catch {
          new Logger('AsistenteModule').error('No se pudo crear el cliente de Anthropic');
          return null;
        }
      },
    },
    AsistenteService,
    ModeracionPreviaService,
    GuardiaService,
    Publicadores,
    RevisionesService,
    RevisionPosteriorService,
    ContextoPersonaService,
    PanelService,
    AlDiaService,
    CrecerService,
    SemillasService,
    SugerenciasService,
    AcuerdosService,
    AsistenteScheduler,
  ],
  exports: [AsistenteService, ModeracionPreviaService, GuardiaService, Publicadores, ContextoPersonaService, SugerenciasService],
})
export class AsistenteModule {}
