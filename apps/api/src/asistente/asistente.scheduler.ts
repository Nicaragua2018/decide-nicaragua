import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { RevisionesService } from './revisiones.service';
import { RevisionPosteriorService } from './revision-posterior.service';
import { SemillasService } from './semillas.service';

const HORA_MS = 3_600_000;

/**
 * Cada hora: vence los textos en revisión cuyo plazo pasó (nunca los publica), borra el texto de
 * los vencidos y no publicables resueltos hace más de 30 días, y revisa después
 * lo publicado sin revisión previa (nivel 3). Una tarea que falla no detiene a la otra.
 */
@Injectable()
export class AsistenteScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AsistenteScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly revisiones: RevisionesService,
    private readonly posterior: RevisionPosteriorService,
    private readonly semillas: SemillasService,
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
        const n = await this.revisiones.vencer(new Date());
        if (n > 0) this.logger.log(`Textos en revisión vencidos: ${n}`);
      } catch (err) {
        this.logger.error(`Falló el vencimiento de revisiones: ${err instanceof Error ? err.name : 'error'}`);
      }
      try {
        const n = await this.revisiones.purgar(new Date());
        if (n > 0) this.logger.log(`Textos en revisión purgados: ${n}`);
      } catch (err) {
        this.logger.error(`Falló la purga de textos en revisión: ${err instanceof Error ? err.name : 'error'}`);
      }
      try {
        const n = await this.posterior.procesar(new Date());
        if (n > 0) this.logger.log(`Revisión posterior: ${n} contenidos revisados`);
      } catch (err) {
        this.logger.error(`Falló la revisión posterior: ${err instanceof Error ? err.name : 'error'}`);
      }
      try {
        const n = await this.semillas.sembrar(new Date());
        if (n > 0) this.logger.log(`Preguntas iniciales sembradas: ${n}`);
      } catch (err) {
        this.logger.error(`Falló la siembra de preguntas iniciales: ${err instanceof Error ? err.name : 'error'}`);
      }
    } finally {
      this.running = false;
    }
  }
}
