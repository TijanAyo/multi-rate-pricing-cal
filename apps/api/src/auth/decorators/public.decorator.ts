import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally-applied JwtAuthGuard.
 *
 * Authentication is on by default and must be explicitly waived, so a route
 * added without any decorator fails closed rather than silently exposing data.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
