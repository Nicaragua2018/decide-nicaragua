import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { API_PREFIX } from '@decide/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // No loguear requests completos para no exponer datos sensibles
    logger: ['error', 'warn', 'log'],
  });

  // Prefijo global /api
  app.setGlobalPrefix(API_PREFIX);

  // Confiar en el primer proxy (Traefik) para que req.ip refleje la IP real del cliente
  // Necesario para que ThrottlerGuard aplique rate limiting por IP de usuario, no por IP del contenedor web
  const expressApp = app.getHttpAdapter().getInstance() as import('express').Application;
  expressApp.set('trust proxy', 1);

  // Parseo de cookies (necesario para tokens HttpOnly)
  app.use(cookieParser());

  // Validación estricta de todos los DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true,   // Rechaza requests con propiedades extra
      transform: true,              // Convierte tipos automáticamente
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // CORS: solo permite el origen configurado; credenciales activas para cookies
  const allowedOrigin = process.env['APP_URL'];
  if (!allowedOrigin) {
    throw new Error('APP_URL environment variable is required');
  }

  app.enableCors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-forwarded-for'],
  });

  const port = parseInt(process.env['API_PORT'] ?? '4000', 10);
  await app.listen(port);

  console.log(`API running on port ${port.toString()} [${process.env['NODE_ENV'] ?? 'development'}]`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
