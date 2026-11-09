import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DecisionPublicaItem } from '@decide/shared';
import { DecisionesService } from './decisiones.service';

/** Rutas públicas (sin sesión) para la portada. Sin cifras, votantes ni ids. */
@Controller('publico')
export class DecisionesPublicasController {
  constructor(private readonly servicio: DecisionesService) {}

  @Get('decisiones')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  decisiones(): Promise<DecisionPublicaItem[]> {
    return this.servicio.getPublicasGenerales();
  }
}
