import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { CambiosReglaService } from './cambios-regla.service';

const HORA_MS = 3_600_000;

/**
 * Cada hora resuelve los cambios de regla cuya votación ya se contó o se canceló: los locales
 * aprobados se aplican, los de la colmena aprobados pasan a la mesa y el resto se cierra. También
 * vence los que llevan más de 30 días esperando a la mesa (quedan rechazado_mesa).
 */
@Injectable()
export class CambiosReglaScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CambiosReglaScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly cambios: CambiosReglaService) {}

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
      try {
        const n = await this.cambios.procesarResultados();
        if (n > 0) this.logger.log(`Cambios de regla resueltos: ${n}`);
      } catch (err) {
        this.logger.error(`Falló la revisión de cambios de regla: ${err instanceof Error ? err.name : 'error'}`);
      }
      try {
        const v = await this.cambios.vencerPendientesMesa();
        if (v > 0) this.logger.log(`Cambios de regla vencidos en la mesa: ${v}`);
      } catch (err) {
        this.logger.error(`Falló el vencimiento de cambios en la mesa: ${err instanceof Error ? err.name : 'error'}`);
      }
    } finally {
      this.running = false;
    }
  }
}
