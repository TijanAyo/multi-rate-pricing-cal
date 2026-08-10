import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { DocumentStatus } from './document-status.enum';
import { LineItem } from './line-item.entity';

@Entity('documents')
// The summary report filters on user + issue date; this index serves it directly.
@Index('idx_documents_user_issue_date', ['userId', 'issueDate'])
export class Document extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  customer!: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
  })
  status!: DocumentStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ name: 'total_discount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalDiscount!: string;

  @Column({ name: 'total_tax', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalTax!: string;

  @Column({ name: 'grand_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  grandTotal!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.documents, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => LineItem, (lineItem) => lineItem.document, {
    cascade: true,
    eager: true,
  })
  lineItems!: LineItem[];
}
