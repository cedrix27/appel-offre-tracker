import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  message: string;
  code?: string;
  errors?: unknown;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Requête invalide',
  401: 'Authentification requise',
  403: 'Accès refusé',
  404: 'Ressource introuvable',
  409: 'Conflit',
  429: 'Trop de requêtes, réessayez dans quelques instants.',
};

/** Normalise toutes les erreurs au format { statusCode, message, code? }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: DEFAULT_MESSAGES[429],
        code: 'RATE_LIMITED',
      };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const body: ErrorBody = {
        statusCode,
        message: DEFAULT_MESSAGES[statusCode] ?? exception.message,
      };
      if (typeof raw === 'string') {
        body.message = raw;
      } else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (typeof r.message === 'string') body.message = r.message;
        else if (Array.isArray(r.message)) body.message = r.message.join(', ');
        if (typeof r.code === 'string') body.code = r.code;
        if (r.errors !== undefined) body.errors = r.errors;
      }
      if (statusCode === 404 && body.message.startsWith('Cannot ')) {
        body.message = DEFAULT_MESSAGES[404];
      }
      return body;
    }
    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR',
    };
  }
}
