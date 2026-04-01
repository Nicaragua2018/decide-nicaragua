import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService y RedisService son @Global(), no requieren import explícito.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
