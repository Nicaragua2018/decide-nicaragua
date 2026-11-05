import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DecisionesService } from './decisiones.service';

const HORA_MS = 3_600_000;

/** Cada hora cierra los debates, las objeciones al modo y las votaciones cuyo plazo venció. */
@Injectable()
export class DecisionesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DecisionesScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly decisiones: DecisionesService) {}

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
      const n = await this.decisiones.processDeadlines(new Date());
      if (n > 0) this.logger.log(`Decisiones que cambiaron de fase: ${n}`);
    } catch (err) {
      this.logger.error(`Falló la revisión de plazos: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
