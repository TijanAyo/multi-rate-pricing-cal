/**
 * Machine-readable codes. The API maps these straight onto its error envelope
 * so clients can switch on `code` instead of parsing message text.
 */
export const CalculationErrorCode = {
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_UNIT_PRICE: 'INVALID_UNIT_PRICE',
  INVALID_DISCOUNT_TYPE: 'INVALID_DISCOUNT_TYPE',
  INVALID_DISCOUNT_PERCENT: 'INVALID_DISCOUNT_PERCENT',
  INVALID_DISCOUNT_FIXED: 'INVALID_DISCOUNT_FIXED',
  DISCOUNT_EXCEEDS_SUBTOTAL: 'DISCOUNT_EXCEEDS_SUBTOTAL',
  INVALID_TAX_PERCENT: 'INVALID_TAX_PERCENT',
} as const;

export type CalculationErrorCode =
  (typeof CalculationErrorCode)[keyof typeof CalculationErrorCode];

export class CalculationError extends Error {
  /** Index of the offending line within the document, when known. */
  lineIndex?: number;

  constructor(
    message: string,
    /** Dotted path of the offending input, e.g. "discount.value". */
    public readonly field: string,
    public readonly code: CalculationErrorCode,
  ) {
    super(message);
    this.name = 'CalculationError';
    // Required for `instanceof` to work when compiled down to ES5-era targets.
    Object.setPrototypeOf(this, CalculationError.prototype);
  }
}
