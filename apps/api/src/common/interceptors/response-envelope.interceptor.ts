import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful body as `{ data: ... }`, mirroring the `{ error: ... }`
 * shape the exception filter produces. One envelope for both outcomes means the
 * client has exactly one response shape to model.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, { data: T } | undefined>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ data: T } | undefined> {
    return next.handle().pipe(
      // A 204 handler returns nothing; leave it bodiless rather than sending
      // `{"data":null}` with a status that promises no content.
      map((data) => (data === undefined ? undefined : { data })),
    );
  }
}
