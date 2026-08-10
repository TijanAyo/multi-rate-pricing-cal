export type DocumentStatus = 'draft' | 'finalized';
export type DiscountType = 'percent' | 'fixed';

export interface Discount {
  type: DiscountType;
  value: string;
}

/**
 * Note the split: `discount` and `taxPercent` are the RULES the user sets, and
 * everything from `subtotal` down is the RESULT the server computed. The client
 * sends the former and only ever displays the latter — it never calculates an
 * amount itself.
 */
export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  position: number;
  discount: Discount | null;
  taxPercent: string | null;
  subtotal: string;
  discountAmount: string;
  afterDiscount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: DocumentStatus;
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingDocument extends DocumentSummary {
  lineItems: LineItem[];
}

/** The payload shape for creating or editing a line item. */
export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: string;
  discount: Discount | null;
  taxPercent: string | null;
}

/** What POST /calc/preview returns — the same module the API persists with. */
export interface PreviewResult {
  lines: {
    subtotal: string;
    discountAmount: string;
    afterDiscount: string;
    taxAmount: string;
    lineTotal: string;
  }[];
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
}

export interface SummaryReport {
  from: string;
  to: string;
  documentCount: number;
  totalSubtotal: string;
  totalDiscount: string;
  totalTax: string;
  totalGrandTotal: string;
  documents: DocumentSummary[];
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
}
