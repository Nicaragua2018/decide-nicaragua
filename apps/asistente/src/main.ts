import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // No loguear cuerpos de requests: contienen datos del negocio de Héctor
    logger: ['error', 'warn', 'log'],
  });

  // Validación estricta de todos los DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Las fotos de la libreta llegan en base64 dentro del JSON del webhook
  app.use(json({ limit: '25mb' }));

  const port = parseInt(process.env['ASISTENTE_PORT'] ?? '4100', 10);
  await app.listen(port);

  console.log(`Asistente running on port ${port.toString()} [${process.env['NODE_ENV'] ?? 'development'}]`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
