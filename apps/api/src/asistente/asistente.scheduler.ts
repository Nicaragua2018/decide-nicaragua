import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RevisionesService } from './revisiones.service';

const HORA_MS = 3_600_000;

/** Cada hora vence los textos en revisión cuyo plazo pasó. Nunca los publica. */
@Injectable()
export class AsistenteScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AsistenteScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly revisiones: RevisionesService) {}

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
      const n = await this.revisiones.vencer(new Date());
      if (n > 0) this.logger.log(`Textos en revisión vencidos: ${n}`);
    } catch (err) {
      this.logger.error(`Falló el vencimiento de revisiones: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.running = false;
    }
  }
}
