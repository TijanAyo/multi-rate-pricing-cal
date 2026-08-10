import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { ApiError } from '../common/http/api-error';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import type { LoginDto, SignupDto } from './dto/auth-credentials.dto';

// bcryptjs is pure JavaScript — no native build step, so the same image builds
// on Alpine as on macOS. It is slower per round than the native binding, hence
// 10 rather than 12; still comfortably above the OWASP floor.
const BCRYPT_ROUNDS = 10;

export interface AuthResult {
  user: { id: string; email: string };
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw ApiError.conflict(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        'email',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create(dto.email, passwordHash);
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    // One generic message for both "no such account" and "wrong password", so
    // the endpoint cannot be used to enumerate which emails are registered.
    // The hash comparison still runs on the miss path to keep timing even.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    return this.issue(user);
  }

  private issue(user: User): AuthResult {
    return {
      user: { id: user.id, email: user.email },
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}

/** A real bcrypt hash of a value nothing will ever match. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7iRRp6Z0iRHnAr0bK9Ea1CjMTNKuqLC';
