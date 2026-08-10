import { calculateDocument, calculateLine } from './calculate';
import { CalculationError, CalculationErrorCode } from './errors';
import type { LineInput } from './types';

/** Asserts the thrown error is a CalculationError with the expected code/field. */
function expectCalculationError(
  run: () => unknown,
  code: CalculationErrorCode,
  field: string,
): CalculationError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CalculationError);
  const error = caught as CalculationError;
  expect(error.code).toBe(code);
  expect(error.field).toBe(field);
  return error;
}

describe('calculateLine — the assignment sample document', () => {
  // Widget A | qty 2 | 100.00 | 10% discount | 5% tax
  it('applies a percent discount before tax, and taxes the discounted amount', () => {
    expect(
      calculateLine({
        quantity: 2,
        unitPrice: '100.00',
        discount: { type: 'percent', value: '10' },
        taxPercent: '5',
      }),
    ).toEqual({
      subtotal: '200.00',
      discountAmount: '20.00',
      afterDiscount: '180.00',
      // The rule that matters: 5% of 180, not 5% of 200 (which would be 10.00).
      taxAmount: '9.00',
      lineTotal: '189.00',
    });
  });

  // Widget B | qty 1 | 50.00 | no discount | 5% tax
  it('taxes the full subtotal when there is no discount', () => {
    expect(
      calculateLine({
        quantity: 1,
        unitPrice: '50.00',
        discount: null,
        taxPercent: '5',
      }),
    ).toEqual({
      subtotal: '50.00',
      discountAmount: '0.00',
      afterDiscount: '50.00',
      taxAmount: '2.50',
      lineTotal: '52.50',
    });
  });

  // Service fee | qty 1 | 200.00 | $20 fixed discount | no tax
  it('subtracts a fixed discount and charges no tax when the rate is absent', () => {
    expect(
      calculateLine({
        quantity: 1,
        unitPrice: '200.00',
        discount: { type: 'fixed', value: '20' },
        taxPercent: null,
      }),
    ).toEqual({
      subtotal: '200.00',
      discountAmount: '20.00',
      afterDiscount: '180.00',
      taxAmount: '0.00',
      lineTotal: '180.00',
    });
  });
});

describe('calculateDocument — the assignment sample document', () => {
  const SAMPLE: LineInput[] = [
    {
      quantity: 2,
      unitPrice: '100.00',
      discount: { type: 'percent', value: '10' },
      taxPercent: '5',
    },
    { quantity: 1, unitPrice: '50.00', discount: null, taxPercent: '5' },
    {
      quantity: 1,
      unitPrice: '200.00',
      discount: { type: 'fixed', value: '20' },
      taxPercent: null,
    },
  ];

  it('produces the exact totals published in the assignment', () => {
    const result = calculateDocument(SAMPLE);

    expect(result.subtotal).toBe('450.00'); // 200 + 50 + 200
    expect(result.totalDiscount).toBe('40.00'); // 20 + 0 + 20
    expect(result.totalTax).toBe('11.50'); // 9.00 + 2.50 + 0
    expect(result.grandTotal).toBe('421.50'); // 189.00 + 52.50 + 180.00
  });

  it('derives the same grand total both ways the assignment describes it', () => {
    const { lines, subtotal, totalDiscount, totalTax, grandTotal } =
      calculateDocument(SAMPLE);

    // Way 1: sum of line totals.
    const sumOfLineTotals = lines.reduce((total, line) => total + Number(line.lineTotal), 0);
    expect(sumOfLineTotals.toFixed(2)).toBe(grandTotal);

    // Way 2: subtotal - discount + tax.
    const derived = Number(subtotal) - Number(totalDiscount) + Number(totalTax);
    expect(derived.toFixed(2)).toBe(grandTotal);
  });
});

describe('rounding policy — half up, per component', () => {
  // Under banker's rounding (round-half-to-even) this would be 0.12.
  it('rounds a .5 tie up, not to even (0.125 -> 0.13)', () => {
    const line = calculateLine({
      quantity: 1,
      unitPrice: '1.00',
      discount: { type: 'percent', value: '12.5' },
    });
    expect(line.discountAmount).toBe('0.13');
    expect(line.afterDiscount).toBe('0.87');
  });

  it('rounds a .5 tie up on tax as well (0.825 -> 0.83)', () => {
    const line = calculateLine({ quantity: 1, unitPrice: '10.00', taxPercent: '8.25' });
    expect(line.taxAmount).toBe('0.83');
    expect(line.lineTotal).toBe('10.83');
  });

  it('rounds a fractional-cent discount up (0.74925 -> 0.75)', () => {
    const line = calculateLine({
      quantity: 3,
      unitPrice: '3.33',
      discount: { type: 'percent', value: '7.5' },
    });
    expect(line.subtotal).toBe('9.99');
    expect(line.discountAmount).toBe('0.75');
    expect(line.afterDiscount).toBe('9.24');
  });

  it('taxes the ROUNDED discounted base, so the parts always add up', () => {
    const line = calculateLine({
      quantity: 3,
      unitPrice: '3.33',
      discount: { type: 'percent', value: '7.5' },
      taxPercent: '7.5',
    });
    // 7.5% of the rounded 9.24 is 0.693 -> 0.69.
    expect(line.taxAmount).toBe('0.69');
    expect(line.lineTotal).toBe('9.93');

    // The displayed components reconcile exactly — no stray fraction of a cent.
    expect(
      (
        Number(line.subtotal) -
        Number(line.discountAmount) +
        Number(line.taxAmount)
      ).toFixed(2),
    ).toBe(line.lineTotal);
  });

  it('does not drift where naive floating-point arithmetic would', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
    const line = calculateLine({ quantity: 3, unitPrice: '0.10', taxPercent: '0' });
    expect(line.subtotal).toBe('0.30');

    // 1.15 * 3 === 3.4499999999999997 as a float, which naively truncates to 3.44.
    const drifted = calculateLine({ quantity: 3, unitPrice: '1.15' });
    expect(drifted.subtotal).toBe('3.45');

    // 0.615 * 100 rounds "wrong" under toFixed because the float sits just below the tie.
    const tie = calculateLine({ quantity: 100, unitPrice: '0.62' });
    expect(tie.subtotal).toBe('62.00');
  });

  it('never rounds the inputs themselves — a 4dp percent is honoured in full', () => {
    const line = calculateLine({
      quantity: 1,
      unitPrice: '1000.00',
      taxPercent: '7.1234',
    });
    // 1000 * 7.1234% = 71.234 -> 71.23. A 2dp-truncated rate (7.12) would give 71.20.
    expect(line.taxAmount).toBe('71.23');
  });
});

describe('edge cases', () => {
  it('handles a zero unit price', () => {
    expect(calculateLine({ quantity: 5, unitPrice: '0', taxPercent: '20' })).toEqual({
      subtotal: '0.00',
      discountAmount: '0.00',
      afterDiscount: '0.00',
      taxAmount: '0.00',
      lineTotal: '0.00',
    });
  });

  it('zeroes the line at a 100% discount, including its tax', () => {
    const line = calculateLine({
      quantity: 2,
      unitPrice: '99.99',
      discount: { type: 'percent', value: '100' },
      taxPercent: '20',
    });
    expect(line.discountAmount).toBe('199.98');
    expect(line.afterDiscount).toBe('0.00');
    expect(line.taxAmount).toBe('0.00');
    expect(line.lineTotal).toBe('0.00');
  });

  it('allows a fixed discount exactly equal to the subtotal', () => {
    const line = calculateLine({
      quantity: 1,
      unitPrice: '200.00',
      discount: { type: 'fixed', value: '200.00' },
    });
    expect(line.afterDiscount).toBe('0.00');
    expect(line.lineTotal).toBe('0.00');
  });

  it('accepts a 0% discount and a 0% tax as explicit no-ops', () => {
    const line = calculateLine({
      quantity: 1,
      unitPrice: '10.00',
      discount: { type: 'percent', value: 0 },
      taxPercent: 0,
    });
    expect(line.discountAmount).toBe('0.00');
    expect(line.taxAmount).toBe('0.00');
    expect(line.lineTotal).toBe('10.00');
  });

  it('accepts numbers as well as strings for inputs', () => {
    expect(
      calculateLine({
        quantity: 2,
        unitPrice: 100,
        discount: { type: 'percent', value: 10 },
        taxPercent: 5,
      }).lineTotal,
    ).toBe('189.00');
  });

  it('treats an omitted discount and tax as absent', () => {
    expect(calculateLine({ quantity: 1, unitPrice: '10.00' })).toEqual({
      subtotal: '10.00',
      discountAmount: '0.00',
      afterDiscount: '10.00',
      taxAmount: '0.00',
      lineTotal: '10.00',
    });
  });

  it('allows a tax percent above 100 (no compliance assumptions are made)', () => {
    expect(calculateLine({ quantity: 1, unitPrice: '10.00', taxPercent: '150' }).taxAmount).toBe(
      '15.00',
    );
  });

  it('returns zeroed totals for a document with no lines', () => {
    expect(calculateDocument([])).toEqual({
      lines: [],
      subtotal: '0.00',
      totalDiscount: '0.00',
      totalTax: '0.00',
      grandTotal: '0.00',
    });
  });

  it('handles large amounts without losing precision', () => {
    const line = calculateLine({
      quantity: 9999,
      unitPrice: '99999.99',
      taxPercent: '10',
    });
    expect(line.subtotal).toBe('999899900.01');
    expect(line.taxAmount).toBe('99989990.00');
  });
});

describe('validation — every input gets a specific error', () => {
  it('rejects a quantity below 1', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 0, unitPrice: '10.00' }),
      CalculationErrorCode.INVALID_QUANTITY,
      'quantity',
    );
  });

  it('rejects a negative quantity', () => {
    expectCalculationError(
      () => calculateLine({ quantity: -3, unitPrice: '10.00' }),
      CalculationErrorCode.INVALID_QUANTITY,
      'quantity',
    );
  });

  it('rejects a fractional quantity', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 1.5, unitPrice: '10.00' }),
      CalculationErrorCode.INVALID_QUANTITY,
      'quantity',
    );
  });

  it('rejects a negative unit price', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 1, unitPrice: '-0.01' }),
      CalculationErrorCode.INVALID_UNIT_PRICE,
      'unitPrice',
    );
  });

  it('rejects an unparseable unit price instead of silently yielding NaN', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 1, unitPrice: 'abc' }),
      CalculationErrorCode.INVALID_UNIT_PRICE,
      'unitPrice',
    );
  });

  it('rejects a discount percent above 100', () => {
    expectCalculationError(
      () =>
        calculateLine({
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'percent', value: '100.01' },
        }),
      CalculationErrorCode.INVALID_DISCOUNT_PERCENT,
      'discount.value',
    );
  });

  it('rejects a negative discount percent', () => {
    expectCalculationError(
      () =>
        calculateLine({
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'percent', value: '-1' },
        }),
      CalculationErrorCode.INVALID_DISCOUNT_PERCENT,
      'discount.value',
    );
  });

  it('rejects a negative fixed discount', () => {
    expectCalculationError(
      () =>
        calculateLine({
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'fixed', value: '-5' },
        }),
      CalculationErrorCode.INVALID_DISCOUNT_FIXED,
      'discount.value',
    );
  });

  it('rejects — rather than clamps — a fixed discount larger than the subtotal', () => {
    const error = expectCalculationError(
      () =>
        calculateLine({
          quantity: 1,
          unitPrice: '100.00',
          discount: { type: 'fixed', value: '150' },
        }),
      CalculationErrorCode.DISCOUNT_EXCEEDS_SUBTOTAL,
      'discount.value',
    );
    // The message names both figures so the user can see why it was refused.
    expect(error.message).toContain('150.00');
    expect(error.message).toContain('100.00');
  });

  it('rejects an unknown discount type', () => {
    expectCalculationError(
      () =>
        calculateLine({
          quantity: 1,
          unitPrice: '10.00',
          // Simulates a bad payload slipping past the DTO layer.
          discount: { type: 'bogus', value: '1' } as never,
        }),
      CalculationErrorCode.INVALID_DISCOUNT_TYPE,
      'discount.type',
    );
  });

  it('rejects a negative tax percent', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 1, unitPrice: '10.00', taxPercent: '-5' }),
      CalculationErrorCode.INVALID_TAX_PERCENT,
      'taxPercent',
    );
  });

  it('rejects an unparseable tax percent', () => {
    expectCalculationError(
      () => calculateLine({ quantity: 1, unitPrice: '10.00', taxPercent: 'ten' }),
      CalculationErrorCode.INVALID_TAX_PERCENT,
      'taxPercent',
    );
  });

  it('tags a document-level error with the index of the offending line', () => {
    const error = expectCalculationError(
      () =>
        calculateDocument([
          { quantity: 1, unitPrice: '10.00' },
          { quantity: 1, unitPrice: '10.00' },
          { quantity: 0, unitPrice: '10.00' }, // the bad one
        ]),
      CalculationErrorCode.INVALID_QUANTITY,
      'quantity',
    );
    expect(error.lineIndex).toBe(2);
  });
});

describe('consistency — the invariant the summary report depends on', () => {
  // A spread of awkward values chosen to produce fractional cents everywhere.
  const DOCUMENTS: LineInput[][] = [
    [
      { quantity: 3, unitPrice: '19.99', discount: { type: 'percent', value: '7.5' }, taxPercent: '8.25' },
      { quantity: 7, unitPrice: '4.37', discount: { type: 'fixed', value: '3.33' }, taxPercent: '19.6' },
    ],
    [
      { quantity: 1, unitPrice: '0.01', discount: { type: 'percent', value: '33.333' }, taxPercent: '5' },
      { quantity: 11, unitPrice: '123.45', taxPercent: '12.5' },
      { quantity: 2, unitPrice: '77.77', discount: { type: 'percent', value: '12.5' } },
    ],
    [{ quantity: 999, unitPrice: '0.07', discount: { type: 'fixed', value: '0.99' }, taxPercent: '2.5' }],
  ];

  it.each(DOCUMENTS.map((lines, index) => [index, lines] as const))(
    'document %i: totals equal the sum of their already-rounded line values',
    (_index, lines) => {
      const result = calculateDocument(lines);

      const sumOf = (pick: (line: (typeof result.lines)[number]) => string): string =>
        result.lines
          .reduce((total, line) => total + Math.round(Number(pick(line)) * 100), 0)
          .toString()
          .padStart(3, '0')
          .replace(/(\d{2})$/, '.$1');

      expect(result.subtotal).toBe(sumOf((line) => line.subtotal));
      expect(result.totalDiscount).toBe(sumOf((line) => line.discountAmount));
      expect(result.totalTax).toBe(sumOf((line) => line.taxAmount));
      expect(result.grandTotal).toBe(sumOf((line) => line.lineTotal));
    },
  );

  it.each(DOCUMENTS.map((lines, index) => [index, lines] as const))(
    'document %i: grandTotal === subtotal - totalDiscount + totalTax',
    (_index, lines) => {
      const { subtotal, totalDiscount, totalTax, grandTotal } = calculateDocument(lines);
      // Compared in integer cents so the assertion itself cannot drift.
      const cents = (value: string): number => Math.round(Number(value) * 100);
      expect(cents(subtotal) - cents(totalDiscount) + cents(totalTax)).toBe(cents(grandTotal));
    },
  );

  it('is deterministic — the same input always yields the same output', () => {
    const lines = DOCUMENTS[0]!;
    expect(calculateDocument(lines)).toEqual(calculateDocument(lines));
  });

  it('every returned money value is a canonical 2dp string', () => {
    const result = calculateDocument(DOCUMENTS[1]!);
    const TWO_DP = /^-?\d+\.\d{2}$/;

    for (const value of [result.subtotal, result.totalDiscount, result.totalTax, result.grandTotal]) {
      expect(value).toMatch(TWO_DP);
    }
    for (const line of result.lines) {
      for (const value of Object.values(line)) {
        expect(value).toMatch(TWO_DP);
      }
    }
  });
});
