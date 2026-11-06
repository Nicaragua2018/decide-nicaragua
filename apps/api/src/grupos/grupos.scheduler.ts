import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { GruposService } from './grupos.service';
import { ComisionesService } from './comisiones.service';

const HORA_MS = 3_600_000;

/**
 * Cada hora:
 * - crea las comisiones de las soluciones aprobadas y cierra sus convocatorias y elecciones vencidas;
 * - archiva los subgrupos y las bifurcaciones cuya convocatoria venció (para una bifurcación,
 *   `contadaAt + bifurcacion.plazo_dias`) o que llevan 30 días con pocos miembros.
 */
@Injectable()
export class GruposScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GruposScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly grupos: GruposService,
    private readonly comisiones: ComisionesService,
  ) {}

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
        const c = await this.comisiones.processDeadlines(new Date());
        if (c > 0) this.logger.log(`Comisiones creadas o actualizadas: ${c}`);
      } catch (err) {
        this.logger.error(`Falló la revisión de comisiones: ${err instanceof Error ? err.name : 'error'}`);
      }
      try {
        const n = await this.grupos.processDeadlines(new Date());
        if (n > 0) this.logger.log(`Grupos de trabajo archivados: ${n}`);
      } catch (err) {
        this.logger.error(`Falló la revisión de plazos: ${err instanceof Error ? err.name : 'error'}`);
      }
    } finally {
      this.running = false;
    }
  }
}
