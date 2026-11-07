import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AuditModule } from '../audit/audit.module';
import { BoardModule } from '../board/board.module';
import { EmailModule } from '../email/email.module';
import { ForumsModule } from '../forums/forums.module';
import { AsistenteController } from './asistente.controller';
import { RevisionesController } from './revisiones.controller';
import { RevisionesService } from './revisiones.service';
import { AsistenteScheduler } from './asistente.scheduler';
import { ANTHROPIC_CLIENT, AsistenteService } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { GuardiaService } from './guardia.service';
import { Publicadores } from './publicadores';
import { RevisionPosteriorService } from './revision-posterior.service';

@Module({
  imports: [AuditModule, EmailModule, BoardModule, ForumsModule],
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
    AsistenteScheduler,
  ],
  exports: [AsistenteService, ModeracionPreviaService, GuardiaService, Publicadores],
})
export class AsistenteModule {}
