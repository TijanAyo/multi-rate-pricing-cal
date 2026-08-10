import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CalculationError } from '@pricing/calc';
import type { Response } from 'express';

import type { ApiErrorBody } from '../http/api-error';

/**
 * Turns every thrown error into one predictable envelope:
 *
 *   { "error": { "code": "...", "message": "...", "field": "..." } }
 *
 * Doing it in one filter is what makes calculation errors, DTO validation
 * failures and lifecycle rejections indistinguishable to the client — it
 * switches on `code` and never has to care which layer refused the request.
 *
 * The HTTP status still carries meaning: the envelope is in addition to a
 * correct status code, not a replacement for one.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toErrorResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled ${status}: ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ error: body });
  }

  private toErrorResponse(exception: unknown): { status: number; body: ApiErrorBody } {
    // Domain errors from the shared calculation module. Their code and field
    // pass straight through, which is the whole point of them carrying those.
    if (exception instanceof CalculationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: exception.code,
          message: exception.message,
          field: exception.field,
          ...(exception.lineIndex !== undefined ? { lineIndex: exception.lineIndex } : {}),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Thrown via ApiError or a custom object — already in envelope shape.
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        return { status, body: payload as ApiErrorBody };
      }

      // A built-in Nest exception (NotFoundException, etc.) with a plain body.
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        status,
        body: {
          code: this.statusToCode(status),
          message: Array.isArray(message) ? message.join('; ') : message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        // Deliberately generic: internal failure detail goes to the log, not
        // to the client.
        message: 'An unexpected error occurred.',
      },
    };
  }

  private statusToCode(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    };
    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
