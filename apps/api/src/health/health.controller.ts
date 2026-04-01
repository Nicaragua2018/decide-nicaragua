import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface ServiceStatus {
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  services: ServiceStatus;
  timestamp: string;
}

/**
 * GET /api/health
 *
 * Endpoint público para monitoreo de infraestructura.
 * Devuelve 200 si todos los servicios responden, 503 si alguno falla.
 * No requiere autenticación — debe ser accesible por el balanceador y alertas.
 *
 * No incluye información sensible del sistema en la respuesta.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [databaseStatus, redisStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allOk = databaseStatus === 'ok' && redisStatus === 'ok';

    if (!allOk) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: allOk ? 'ok' : 'degraded',
      services: {
        database: databaseStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      await this.redis.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
