import { Injectable, Logger } from '@nestjs/common';
import type { AccountStatus } from '@prisma/client';
import { PanelService, type RespuestaSala } from '../asistente/panel.service';
import { PrismaService } from '../prisma/prisma.service';

export const GUARDIAN_NO_DISPONIBLE = 'Guardián no está disponible ahora.';
export const GUARDIAN_LIMITE = 'Llegaste a tu límite de preguntas a Guardián por hoy.';
export const GUARDIAN_FALLO = 'Guardián no pudo responder. Inténtalo más tarde.';

const AVISOS: Record<Exclude<RespuestaSala['tipo'], 'respuesta'>, string> = {
  apagado: GUARDIAN_NO_DISPONIBLE,
  descansa: GUARDIAN_NO_DISPONIBLE,
  limite: GUARDIAN_LIMITE,
  fallo: GUARDIAN_FALLO,
};

/**
 * Guardián en la sala: responde solo cuando lo llaman y solo recibe el mensaje que lo llama.
 * Este servicio no lee la sala: no tiene forma de enviar otros mensajes a la IA.
 */
@Injectable()
export class ChatGuardianService {
  private readonly logger = new Logger(ChatGuardianService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly panel: PanelService,
  ) {}

  /** Publica en la sala la respuesta de Guardián o un aviso del sistema. Nunca lanza. */
  async responder(
    groupId: string,
    preguntaId: string,
    quien: { userId: string; profileId: string; status: AccountStatus },
    texto: string,
  ): Promise<void> {
    let r: RespuestaSala;
    try {
      r = await this.panel.responderEnSala(quien, texto);
    } catch (err) {
      this.logger.error(`Guardián falló en la sala: ${err instanceof Error ? err.name : 'error'}`);
      r = { tipo: 'fallo' };
    }
    try {
      if (r.tipo === 'respuesta') {
        await this.prisma.chatMessage.create({
          data: { groupId, kind: 'guardian', authorProfileId: null, replyToId: preguntaId, body: r.texto, enlaces: r.enlaces },
        });
      } else {
        await this.prisma.chatMessage.create({
          data: { groupId, kind: 'sistema', authorProfileId: null, replyToId: preguntaId, body: AVISOS[r.tipo] },
        });
      }
    } catch (err) {
      this.logger.error(`No se pudo publicar la respuesta de Guardián: ${err instanceof Error ? err.name : 'error'}`);
    }
  }
}
