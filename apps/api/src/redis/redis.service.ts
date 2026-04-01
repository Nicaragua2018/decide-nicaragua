import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    this.client.on('error', (err: unknown) => {
      this.logger.error('Redis client error', err);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<'OK'> {
    return this.client.set(key, value, 'EX', ttlSeconds);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /** Verifica la conectividad con Redis. Usado por el health check. */
  async ping(): Promise<void> {
    const response = await this.client.ping();
    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis ping response: ${response}`);
    }
  }
}
