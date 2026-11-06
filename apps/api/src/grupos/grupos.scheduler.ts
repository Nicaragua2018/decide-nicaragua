import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { GruposService } from './grupos.service';

const HORA_MS = 3_600_000;

/** Cada hora archiva los subgrupos cuya convocatoria venció o que llevan 30 días con pocos miembros. */
@Injectable()
export class GruposScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GruposScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly grupos: GruposService) {}

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
      const n = await this.grupos.processDeadlines(new Date());
      if (n > 0) this.logger.log(`Grupos de trabajo archivados: ${n}`);
    } catch (err) {
      this.logger.error(`Falló la revisión de plazos: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
