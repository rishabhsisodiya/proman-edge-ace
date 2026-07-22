import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Without this, ErpDbService.onModuleDestroy() (pool.end()) never runs on SIGTERM/SIGINT,
  // leaving the pool's DB connections open until MariaDB's wait_timeout reaps them — which
  // silently eats into a low max_user_connections cap across restarts.
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 4100);
}
bootstrap();
