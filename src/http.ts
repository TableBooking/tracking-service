import { Catch, HttpException, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { ZodError } from 'zod';
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const infra =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      /^(08|53|57|ECONN|ETIMEDOUT|ENOTFOUND)/.test(String(error.code));
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof HttpException
          ? error.getStatus()
          : infra
            ? 503
            : 500;
    const body = error instanceof HttpException ? error.getResponse() : undefined;
    res.status(status).json({
      code:
        typeof body === 'object' && body && 'code' in body
          ? body.code
          : ((
              {
                400: 'VALIDATION_ERROR',
                401: 'UNAUTHORIZED',
                403: 'FORBIDDEN',
                404: 'NOT_FOUND',
                503: 'SERVICE_UNAVAILABLE',
              } as Record<number, string>
            )[status] ?? 'INTERNAL_ERROR'),
      message:
        status >= 500
          ? 'Service temporarily unavailable'
          : error instanceof ZodError
            ? 'Invalid request'
            : error instanceof Error
              ? error.message
              : 'Request rejected',
      correlationId: req.id,
    });
  }
}
