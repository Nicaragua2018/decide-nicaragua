import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ForumsService } from './forums.service';

const HORA_MS = 3_600_000;

/**
 * Cada hora cierra las solicitudes de moderación vencidas: una provisional sin segunda firma
 * vuelve a mostrar el contenido y una pendiente se cierra sin tocarlo.
 */
@Injectable()
export class ModeracionScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ModeracionScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly forums: ForumsService) {}

  onApplicationBootstrap(): void {
    if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), HORA_MS);
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
      const n = await this.forums.processModerationDeadlines(new Date());
      if (n > 0) this.logger.log(`Solicitudes de moderación vencidas: ${n}`);
    } catch (err) {
      this.logger.error(`Falló la revisión de plazos de moderación: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
