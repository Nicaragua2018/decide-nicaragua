import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ForumsService } from './forums.service';

/** Cada 15 minutos: una ocultación provisional no debe durar mucho más de sus 48 h. */
export const MODERACION_INTERVALO_MS = 15 * 60_000;

/**
 * Cada 15 minutos cierra las solicitudes de moderación vencidas: una provisional sin segunda firma
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
    this.timer = setInterval(() => void this.run(), MODERACION_INTERVALO_MS);
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
