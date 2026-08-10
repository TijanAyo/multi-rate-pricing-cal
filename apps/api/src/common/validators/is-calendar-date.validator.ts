import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A bare calendar date, 'YYYY-MM-DD' — no time, no timezone.
 *
 * Stricter than `@IsDateString`, which also accepts full ISO timestamps. An
 * issue date is a day on a calendar, not an instant; letting a timestamp in
 * would mean the same document could report a different date depending on who
 * is looking at it.
 */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const match = CALENDAR_DATE.exec(value);
          if (!match) return false;

          const [, year, month, day] = match;
          const parsed = new Date(`${value}T00:00:00Z`);
          if (Number.isNaN(parsed.getTime())) return false;

          // Rejects overflow like 2026-02-31, which Date would roll forward.
          return (
            parsed.getUTCFullYear() === Number(year) &&
            parsed.getUTCMonth() + 1 === Number(month) &&
            parsed.getUTCDate() === Number(day)
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a calendar date in YYYY-MM-DD form.`;
        },
      },
    });
  };
}
