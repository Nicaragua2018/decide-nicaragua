import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConvocatoriaService } from './convocatoria.service';
import { PosesionService } from './posesion.service';
import { RevocacionService } from './revocacion.service';

const HORA_MS = 3_600_000;

/**
 * Cada hora convoca las elecciones que tocan y mueve de fase las que ya pueden avanzar.
 * Cada paso va en su propio try/catch: si uno falla, los demás siguen.
 * Para añadir un paso (por ejemplo, el conteo), súmalo a `pasos()`.
 */
@Injectable()
export class EleccionesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EleccionesScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly convocatoria: ConvocatoriaService,
    private readonly posesion: PosesionService,
    private readonly revocacion: RevocacionService,
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

  private pasos(): { nombre: string; correr: (now: Date) => Promise<number> }[] {
    return [
      { nombre: 'Elecciones convocadas', correr: (now) => this.convocatoria.convocar(now) },
      { nombre: 'Elecciones que cambiaron de fase', correr: (now) => this.convocatoria.avanzar(now) },
      { nombre: 'Elecciones contadas', correr: (now) => this.posesion.contarVencidas(now) },
      { nombre: 'Pedidos de revocación vencidos', correr: (now) => this.revocacion.vencer(now) },
    ];
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      for (const paso of this.pasos()) {
        try {
          const n = await paso.correr(now);
          if (n > 0) this.logger.log(`${paso.nombre}: ${n}`);
        } catch (err) {
          this.logger.error(`Falló «${paso.nombre}»: ${err instanceof Error ? err.name : 'error'}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
