import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ChatService } from './chat.service';

/** Cada 6 horas: el plazo de conservación se mide en días. */
export const CHAT_LIMPIEZA_INTERVALO_MS = 6 * 3600_000;

/** Borra los mensajes del chat que ya vencieron según la regla «chat.conservacion_dias». */
@Injectable()
export class ChatScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ChatScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly chat: ChatService) {}

  onApplicationBootstrap(): void {
    if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), CHAT_LIMPIEZA_INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.chat.limpiar(new Date());
      if (n > 0) this.logger.log(`Mensajes de chat vencidos borrados: ${n.toString()}`);
    } catch (err) {
      this.logger.error(`Falló la limpieza del chat: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
