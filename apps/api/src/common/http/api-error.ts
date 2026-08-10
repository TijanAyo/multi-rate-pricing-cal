import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The shape every error response carries.
 *
 * `code` is the contract the client switches on — stable, machine-readable, and
 * safe to depend on. `message` is for humans and may be reworded freely.
 * `field` lets the UI attach the message to the input that caused it.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  field?: string;
  /** Index of the offending line item, when the error came from one. */
  lineIndex?: number;
}

/**
 * An HttpException that always carries a `code`. Throwing this rather than a
 * bare `BadRequestException('...')` is what keeps every error in the API
 * machine-readable instead of a prose string the client has to parse.
 */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, body: ApiErrorBody) {
    super(body, status);
  }

  static badRequest(code: string, message: string, field?: string): ApiError {
    return new ApiError(HttpStatus.BAD_REQUEST, { code, message, field });
  }

  static unauthorized(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, { code, message });
  }

  static forbidden(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.FORBIDDEN, { code, message });
  }

  static notFound(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, { code, message });
  }

  static conflict(code: string, message: string, field?: string): ApiError {
    return new ApiError(HttpStatus.CONFLICT, { code, message, field });
  }
}
