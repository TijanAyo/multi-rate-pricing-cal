import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { ApiError } from '../common/http/api-error';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * Registered globally in AppModule, so every route requires a valid bearer
 * token unless it is explicitly marked `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  override handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      // Rethrown in the envelope shape so a missing token looks like every
      // other error the client handles.
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized(
        'UNAUTHENTICATED',
        'You must be signed in to perform this action.',
      );
    }
    return user;
  }
}
