/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { join } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // rawBody: true - el webhook de WhatsApp (Fase 5b del asistente de IA)
  // necesita los bytes crudos del POST para verificar `X-Hub-Signature-256`
  // (HMAC sobre el body tal cual, no sobre el JSON ya parseado - ver
  // whatsapp-webhook-signature.util.ts). No afecta a ninguna otra ruta: Nest
  // sigue parseando `request.body` normalmente, esto sólo AGREGA
  // `request.rawBody` (Buffer) al lado. Va como 3er argumento de
  // NestFactory.create (NestApplicationOptions), NO como opción del
  // constructor de FastifyAdapter - ese constructor no tiene ningún efecto
  // sobre esto (confirmado leyendo NestApplication.registerParserMiddleware,
  // que lee `this.appOptions.rawBody`, no nada del adapter).
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );
  // 20MB - antes 5MB, insuficiente para el folleto (PDF) y adjunto ZIP de
  // artículo (hasta 10MB/20MB respectivamente, ver ArticleAttachmentsService)
  // agregados el 2026-08-21. Este es sólo el techo global antes de que
  // Fastify entregue el stream; cada servicio sigue validando su propio
  // límite más chico (imágenes/remitos: 3MB).
  await app.register(multipart, { limits: { fileSize: 20_000_000 } });
  // No extra plugin needed for "Sign in with Apple"'s POST
  // application/x-www-form-urlencoded callback (response_mode "form_post",
  // unlike Google/Microsoft's plain GET redirect) - @nestjs/platform-fastify's
  // FastifyAdapter already registers both a JSON and an urlencoded body
  // parser by default (see registerParserMiddleware/
  // registerUrlencodedContentParser in its source); adding @fastify/formbody
  // on top collides with it ("Content type parser already present").
  // Serves uploaded article images (see ArticleImageService) unauthenticated,
  // from a random-uuid filename rather than a tenantId-scoped path - a
  // deliberate, narrow exception to "everything is RLS/tenant-protected"
  // (product photos aren't fiscal/financial data), documented in
  // Article.imageUrl's schema comment. First real file-storage feature in
  // the project - `uploads/` lives at the repo root, gitignored.
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });
  // @fastify/cors defaults `methods` to 'GET,HEAD,POST' - narrower than every
  // other CORS middleware's default, and narrower than this API's actual
  // surface (PATCH/DELETE are used throughout). Left unset, any PATCH/DELETE
  // request from the browser fails preflight with a CORS error that never
  // reaches this server's logs, since the browser blocks it client-side
  // before sending the real request.
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
