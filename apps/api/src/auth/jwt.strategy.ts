import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ApiError } from '../common/http/api-error';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Re-checking against the database means a deleted account's still-valid
    // token stops working immediately, rather than at token expiry.
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw ApiError.unauthorized('INVALID_TOKEN', 'This session is no longer valid.');
    }
    return { id: user.id, email: user.email };
  }
}
