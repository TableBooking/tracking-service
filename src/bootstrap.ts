import 'reflect-metadata';
import type { Request, Response, NextFunction } from 'express';
import { Module, Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LoggerModule, Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { Database } from './database.js';
import { AccessGuard } from './auth.js';
import { ErrorFilter } from './http.js';
import { config } from './config.js';
import { DomainController, DomainConsumer } from './domain.js';
import { Messaging } from './messaging.js';
@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.ready();
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.LOG_LEVEL,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: String(req.url ?? '').split('?')[0],
          }),
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      },
    }),
  ],
  controllers: [HealthController, DomainController],
  providers: [Database, AccessGuard, DomainConsumer, Messaging],
})
class AppModule {}
export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.use((req: Request & { id?: string }, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.id =
      typeof incoming === 'string' && /^[a-f0-9-]{36}$/i.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
