import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InquietudesService } from './inquietudes.service';

const HORA_MS = 3_600_000;

/** Cada hora abre como debate las inquietudes cuyo plazo venció sin respuesta. */
@Injectable()
export class InquietudesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InquietudesScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly inquietudes: InquietudesService) {}

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
    try {
      const n = await this.inquietudes.processDeadlines(new Date());
      if (n > 0) this.logger.log(`Inquietudes abiertas por la comunidad: ${n}`);
    } catch (err) {
      this.logger.error(`Falló la revisión de plazos: ${err instanceof Error ? err.name : 'error'}`);
    }
  }
}
