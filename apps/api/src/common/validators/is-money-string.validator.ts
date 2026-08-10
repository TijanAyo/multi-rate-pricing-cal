import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/** Optional sign, digits, optional fractional part. No exponents, no spaces. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Accepts a decimal as a string (preferred) or as a JS number (tolerated for
 * client convenience), and normalises it to a string.
 *
 * Money crosses the wire as a string so no parsing step can reintroduce binary
 * float drift. Numbers are accepted rather than rejected because a JSON body
 * written by hand or by a naive client will often send `100` — the value is
 * safe as long as it is stringified before it reaches decimal.js and is never
 * arithmetic'd as a float on the way.
 *
 * Range and business rules (>= 0, 0-100, and so on) are deliberately NOT
 * checked here — those live in @pricing/calc, which is the single place that
 * decides what a valid amount is.
 */
export function IsMoneyString(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMoneyString',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value === 'number') return Number.isFinite(value);
          return typeof value === 'string' && DECIMAL_PATTERN.test(value.trim());
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a decimal number.`;
        },
      },
    });
  };
}

/** Normalises an accepted money input to its string form. */
export function toMoneyString(value: string | number): string {
  return typeof value === 'number' ? String(value) : value.trim();
}
