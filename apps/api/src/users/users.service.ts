import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.users.save(
      this.users.create({ email: normalizeEmail(email), passwordHash }),
    );
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
