import { Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { Document } from '../../documents/entities/document.entity';

@Entity('users')
/**
 * A PARTIAL unique index, not `@Column({ unique: true })`.
 *
 * With soft delete, a plain unique constraint would let a deleted account hold
 * its email hostage forever — nobody could ever register it again. Scoping the
 * index to live rows keeps emails unique among active users while freeing them
 * once an account is deleted.
 */
@Index('uq_users_email_active', ['email'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  /** bcrypt hash. The plaintext password is never stored or logged. */
  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;

  @OneToMany(() => Document, (document) => document.user)
  documents!: Document[];
}
