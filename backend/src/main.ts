import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // Local disk storage for FSV photo uploads (backend/uploads/fsv-photos) —
  // served back at /uploads/*, matching the URL FsvController.uploadPhoto()
  // constructs and stores on FsvPhoto.url.
  fs.mkdirSync(path.join(process.cwd(), 'uploads', 'fsv-photos'), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), 'uploads', 'fsv-signatures'), { recursive: true });
  // rawBody: true keeps the exact request bytes available (req.rawBody) —
  // needed to verify ERPNext's HMAC webhook signature, which is computed
  // over the raw payload, not the re-serialized parsed JSON (those aren't
  // guaranteed byte-identical).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Behind a TLS-terminating reverse proxy (Nginx/load balancer) in
  // production, the direct connection to this Node process is plain HTTP —
  // without trusting the proxy's X-Forwarded-Proto header, req.protocol
  // would always report "http" even on an HTTPS site, so
  // FsvController.uploadPhoto()/uploadSignature() would build http:// URLs
  // that browsers then block as mixed content on an https:// page.
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
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
