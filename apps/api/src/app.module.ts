import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { GroupsModule } from './groups/groups.module';
import { DeliberationModule } from './deliberation/deliberation.module';
import { VotingModule } from './voting/voting.module';
import { SortitionModule } from './sortition/sortition.module';
import { UsersModule } from './users/users.module';
import { NewsletterModule } from './newsletter/newsletter.module';

@Module({
  imports: [
    // Variables de entorno disponibles en toda la aplicación
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),

    // Rate limiting global (baseline): 100 requests / 60s por IP
    // Los endpoints de auth sobreescriben con @Throttle() a límites más estrictos
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // Infraestructura global (PrismaModule y RedisModule son @Global())
    PrismaModule,
    RedisModule,

    // Módulos de dominio
    AuthModule,
    AuditModule,
    HealthModule,
    GroupsModule,
    DeliberationModule,
    VotingModule,
    SortitionModule,
    UsersModule,
    NewsletterModule,
  ],
  providers: [
    // ThrottlerGuard aplicado globalmente a todos los endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

/** Valida que las variables de entorno críticas estén presentes al arrancar */
function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'APP_URL', 'IP_HASH_SALT', 'RESEND_API_KEY', 'EMAIL_FROM'];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const jwtSecret = config['JWT_SECRET'] as string;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  return config;
}
