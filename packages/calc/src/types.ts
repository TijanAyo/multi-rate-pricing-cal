/**
 * Money values cross this boundary as strings ("100.00"), never as JS numbers.
 * A number would reintroduce the float drift this module exists to prevent.
 * Inputs accept `number | string` for ergonomics; every output is a 2dp string.
 */

export const DISCOUNT_TYPES = ['percent', 'fixed'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/**
 * A discount is one value plus a type tag, never two independent fields.
 * That makes "10% off AND $20 off at the same time" unrepresentable rather
 * than merely invalid. `null` means the line carries no discount.
 */
export type DiscountInput =
  | { type: 'percent'; value: number | string }
  | { type: 'fixed'; value: number | string }
  | null;

export interface LineInput {
  quantity: number;
  unitPrice: number | string;
  discount?: DiscountInput;
  taxPercent?: number | string | null;
}

export interface LineResult {
  /** quantity x unitPrice */
  subtotal: string;
  /** the discount rule resolved into cash */
  discountAmount: string;
  /** subtotal - discountAmount — the base the tax applies to */
  afterDiscount: string;
  /** taxPercent of afterDiscount */
  taxAmount: string;
  /** afterDiscount + taxAmount */
  lineTotal: string;
}

export interface DocumentResult {
  lines: LineResult[];
  /** sum of line subtotals, before any discount */
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
}
