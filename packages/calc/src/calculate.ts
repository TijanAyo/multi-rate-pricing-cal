import Decimal from 'decimal.js';

import { CalculationError, CalculationErrorCode } from './errors';
import type { DocumentResult, LineInput, LineResult } from './types';

/**
 * ROUNDING POLICY
 * ---------------
 * 1. All money arithmetic runs through decimal.js, never JS `number`.
 *    `0.1 + 0.2 === 0.30000000000000004` in binary floating point; over a
 *    document's worth of lines that drift becomes a visibly wrong total.
 *
 * 2. Every cash component is rounded to 2 decimal places AS IT IS PRODUCED,
 *    and the rounded value is what flows downstream: round the subtotal, round
 *    the discount and subtract the rounded value, round the tax and add the
 *    rounded value. Each number a user sees is therefore a real cent, and the
 *    figures on screen add up exactly rather than approximately.
 *
 * 3. Ties round HALF UP (2.225 -> 2.23), which is what retail pricing
 *    conventionally does and what a reviewer checking by hand will expect.
 *    Note this differs from JS `toFixed`, which is not reliably half-up.
 *
 * 4. INPUTS ARE NEVER ROUNDED. Unit prices, discount percentages and tax
 *    percentages are used at full precision; only computed cash is rounded.
 *
 * 5. Document totals are the sums of ALREADY-ROUNDED line values, so a total
 *    can never disagree with the parts it is made of. This is what lets the
 *    summary report reconcile against individual documents by construction.
 */

/**
 * A scoped Decimal constructor. Deliberately NOT `Decimal.set(...)`, which
 * mutates global config and would leak this module's policy into every other
 * consumer of decimal.js in the process (and could equally be clobbered by one).
 */
const Money = Decimal.clone({
  rounding: Decimal.ROUND_HALF_UP,
  precision: 30,
});

type MoneyValue = InstanceType<typeof Money>;

const ZERO = new Money(0);
const HUNDRED = new Money(100);

/** Rounds to 2dp half-up and returns the canonical string form. */
function round2(value: MoneyValue): string {
  return value.toFixed(2);
}

/**
 * decimal.js throws on unparseable input rather than yielding NaN, so parsing
 * is wrapped to produce a domain error carrying the offending field.
 */
function toDecimal(
  value: number | string,
  field: string,
  code: CalculationErrorCode,
  message: string,
): MoneyValue {
  let parsed: MoneyValue;
  try {
    parsed = new Money(value);
  } catch {
    throw new CalculationError(message, field, code);
  }
  if (!parsed.isFinite()) {
    throw new CalculationError(message, field, code);
  }
  return parsed;
}

/**
 * Computes one line's amounts.
 *
 * Order of operations is fixed by the spec: subtotal, then discount, then tax
 * on the DISCOUNTED amount (5% of 180, not of 200).
 *
 * @throws {CalculationError} on any invalid input, with a specific code.
 */
export function calculateLine(input: LineInput): LineResult {
  const { quantity, unitPrice, discount = null, taxPercent = null } = input;

  // --- quantity -----------------------------------------------------------
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw new CalculationError(
      'Quantity must be a whole number of at least 1.',
      'quantity',
      CalculationErrorCode.INVALID_QUANTITY,
    );
  }

  // --- unit price ---------------------------------------------------------
  const price = toDecimal(
    unitPrice,
    'unitPrice',
    CalculationErrorCode.INVALID_UNIT_PRICE,
    'Unit price must be a number of zero or greater.',
  );
  if (price.lessThan(0)) {
    throw new CalculationError(
      'Unit price must be zero or greater.',
      'unitPrice',
      CalculationErrorCode.INVALID_UNIT_PRICE,
    );
  }

  // --- subtotal -----------------------------------------------------------
  // Rounded immediately so everything downstream works from a real cent value.
  const subtotal = new Money(round2(price.times(quantity)));

  // --- discount rule -> cash ----------------------------------------------
  let discountAmount = ZERO;

  if (discount !== null && discount !== undefined) {
    if (discount.type !== 'percent' && discount.type !== 'fixed') {
      throw new CalculationError(
        "Discount type must be either 'percent' or 'fixed'.",
        'discount.type',
        CalculationErrorCode.INVALID_DISCOUNT_TYPE,
      );
    }

    if (discount.type === 'percent') {
      const percent = toDecimal(
        discount.value,
        'discount.value',
        CalculationErrorCode.INVALID_DISCOUNT_PERCENT,
        'Discount percent must be a number between 0 and 100.',
      );
      if (percent.lessThan(0) || percent.greaterThan(100)) {
        throw new CalculationError(
          'Discount percent must be between 0 and 100.',
          'discount.value',
          CalculationErrorCode.INVALID_DISCOUNT_PERCENT,
        );
      }
      discountAmount = subtotal.times(percent).dividedBy(HUNDRED);
    } else {
      const fixed = toDecimal(
        discount.value,
        'discount.value',
        CalculationErrorCode.INVALID_DISCOUNT_FIXED,
        'Fixed discount must be a number of zero or greater.',
      );
      if (fixed.lessThan(0)) {
        throw new CalculationError(
          'Fixed discount must be zero or greater.',
          'discount.value',
          CalculationErrorCode.INVALID_DISCOUNT_FIXED,
        );
      }
      discountAmount = fixed;
    }
  }

  // Round before comparing and before subtracting: the stored, displayed and
  // validated discount are then all the same value.
  const roundedDiscount = new Money(round2(discountAmount));

  // Policy: REJECT rather than clamp. The spec permits either, so long as the
  // choice is documented (see README).
  if (roundedDiscount.greaterThan(subtotal)) {
    throw new CalculationError(
      `Fixed discount of ${round2(roundedDiscount)} cannot exceed the line subtotal of ${round2(subtotal)}.`,
      'discount.value',
      CalculationErrorCode.DISCOUNT_EXCEEDS_SUBTOTAL,
    );
  }

  // Both operands are exact 2dp values, so this needs no further rounding.
  const afterDiscount = subtotal.minus(roundedDiscount);

  // --- tax on the discounted base -----------------------------------------
  let taxAmount = ZERO;

  if (taxPercent !== null && taxPercent !== undefined && taxPercent !== '') {
    const rate = toDecimal(
      taxPercent,
      'taxPercent',
      CalculationErrorCode.INVALID_TAX_PERCENT,
      'Tax percent must be a number of zero or greater.',
    );
    if (rate.lessThan(0)) {
      throw new CalculationError(
        'Tax percent must be zero or greater.',
        'taxPercent',
        CalculationErrorCode.INVALID_TAX_PERCENT,
      );
    }
    taxAmount = afterDiscount.times(rate).dividedBy(HUNDRED);
  }

  const roundedTax = new Money(round2(taxAmount));
  const lineTotal = afterDiscount.plus(roundedTax);

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(roundedDiscount),
    afterDiscount: round2(afterDiscount),
    taxAmount: round2(roundedTax),
    lineTotal: round2(lineTotal),
  };
}

/**
 * Computes every line, then sums the already-rounded line values.
 *
 * Because each `LineResult` field is an exact 2dp string, the sums need no
 * second rounding pass — `round2` here only normalises the string form.
 *
 * @throws {CalculationError} tagged with `lineIndex` identifying the bad line.
 */
export function calculateDocument(lines: readonly LineInput[]): DocumentResult {
  const results: LineResult[] = lines.map((line, index) => {
    try {
      return calculateLine(line);
    } catch (error) {
      if (error instanceof CalculationError) {
        error.lineIndex = index;
      }
      throw error;
    }
  });

  const sum = (pick: (result: LineResult) => string): string =>
    round2(
      results.reduce<MoneyValue>(
        (accumulator, result) => accumulator.plus(new Money(pick(result))),
        ZERO,
      ),
    );

  return {
    lines: results,
    subtotal: sum((r) => r.subtotal),
    totalDiscount: sum((r) => r.discountAmount),
    totalTax: sum((r) => r.taxAmount),
    grandTotal: sum((r) => r.lineTotal),
  };
}
