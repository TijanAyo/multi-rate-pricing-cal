import type { DocumentStatus } from './entities/document-status.enum';
import type { DiscountType } from './entities/discount-type.enum';
import type { Document } from './entities/document.entity';
import type { LineItem } from './entities/line-item.entity';

/**
 * The wire shape of a line item.
 *
 * Note the split the entity also makes: `discount`/`taxPercent` are the RULES
 * the user set, while `subtotal`/`discountAmount`/`taxAmount`/`lineTotal` are
 * the RESULTS the server computed from them. A client may send the former and
 * may only ever read the latter.
 *
 * Every money field is a string. Emitting `189` instead of `"189.00"` would
 * hand the value back to the float arithmetic this whole design avoids.
 */
export interface LineItemView {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  position: number;
  discount: { type: DiscountType; value: string } | null;
  taxPercent: string | null;
  subtotal: string;
  discountAmount: string;
  /** subtotal - discountAmount; the base the tax was applied to. */
  afterDiscount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface DocumentView {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: DocumentStatus;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  lineItems: LineItemView[];
  createdAt: string;
  updatedAt: string;
}

/** Summary row for list screens — no line items, so listing stays cheap. */
export type DocumentSummaryView = Omit<DocumentView, 'lineItems'>;

export function toLineItemView(line: LineItem): LineItemView {
  return {
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    position: line.position,
    discount:
      line.discountType && line.discountValue !== null
        ? { type: line.discountType, value: line.discountValue }
        : null,
    taxPercent: line.taxPercent,
    subtotal: line.subtotal,
    discountAmount: line.discountAmount,
    // Both operands are exact 2dp values, so subtracting in cents is safe and
    // saves storing a column that is fully determined by two others.
    afterDiscount: subtractMoney(line.subtotal, line.discountAmount),
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
  };
}

export function toDocumentSummaryView(document: Document): DocumentSummaryView {
  return {
    id: document.id,
    title: document.title,
    customer: document.customer,
    issueDate: document.issueDate,
    status: document.status,
    subtotal: document.subtotal,
    totalDiscount: document.totalDiscount,
    totalTax: document.totalTax,
    grandTotal: document.grandTotal,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toDocumentView(document: Document): DocumentView {
  return {
    ...toDocumentSummaryView(document),
    lineItems: (document.lineItems ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toLineItemView),
  };
}

/** Subtracts two exact 2dp money strings via integer cents. */
function subtractMoney(a: string, b: string): string {
  const cents = Math.round(Number(a) * 100) - Math.round(Number(b) * 100);
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents).toString().padStart(3, '0');
  return `${sign}${absolute.slice(0, -2)}.${absolute.slice(-2)}`;
}
