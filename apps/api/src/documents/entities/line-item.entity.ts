import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { DiscountType } from './discount-type.enum';
import { Document } from './document.entity';

@Entity('line_items')
@Index('idx_line_items_document', ['documentId'])
/**
 * The discount is stored as ONE value plus a type tag, so "10% off AND $20 off
 * simultaneously" is not a state this table can represent. The check constraint
 * closes the remaining gap: the tag and the value are either both absent or
 * both present, never half-set.
 */
@Check('chk_line_items_discount_pair', '("discount_type" IS NULL) = ("discount_value" IS NULL)')
@Check('chk_line_items_quantity_positive', '"quantity" >= 1')
export class LineItem extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice!: string;

  /** Position in the document. Without it, row order would be arbitrary. */
  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ name: 'discount_type', type: 'enum', enum: DiscountType, nullable: true })
  discountType!: DiscountType | null;

  @Column({ name: 'discount_value', type: 'numeric', precision: 14, scale: 4, nullable: true })
  discountValue!: string | null;

  @Column({ name: 'tax_percent', type: 'numeric', precision: 9, scale: 4, nullable: true })
  taxPercent!: string | null;


  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  discountAmount!: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount!: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  lineTotal!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, (document) => document.lineItems, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;
}
