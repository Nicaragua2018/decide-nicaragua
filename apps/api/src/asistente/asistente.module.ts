import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { AsistenteController } from './asistente.controller';
import { ANTHROPIC_CLIENT, AsistenteService } from './asistente.service';
import { ModeracionPreviaService } from './moderacion-previa.service';
import { GuardiaService } from './guardia.service';
import { Publicadores } from './publicadores';

@Module({
  imports: [AuditModule, EmailModule],
  controllers: [AsistenteController],
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
  ],
  exports: [AsistenteService, ModeracionPreviaService, GuardiaService, Publicadores],
})
export class AsistenteModule {}
