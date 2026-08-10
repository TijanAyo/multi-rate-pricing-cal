/**
 * Money formatting that NEVER converts through a JS number.
 *
 * The design prototype used `Number(n).toLocaleString(...)`, which re-parses an
 * exact decimal into a binary float purely to print it. That silently undoes
 * the work decimal.js does on the server: a value the API computed as an exact
 * "1234567.85" can come back out of a float round-trip as something else.
 *
 * Every function here works on the digit string directly. The server already
 * guarantees a canonical 2dp form, so there is nothing to compute — only
 * separators to insert.
 */

/** "1234.5" -> "$1,234.50". Handles a leading minus and missing decimals. */
export function formatMoney(value: string | null | undefined, currency = '$'): string {
  if (value === null || value === undefined || value === '') return `${currency}0.00`;

  const negative = value.trim().startsWith('-');
  const digits = value.trim().replace(/^[-+]/, '');

  const [wholePart = '0', fractionPart = ''] = digits.split('.');
  const whole = groupThousands(wholePart.replace(/^0+(?=\d)/, ''));
  const fraction = fractionPart.padEnd(2, '0').slice(0, 2);

  return `${negative ? '-' : ''}${currency}${whole}.${fraction}`;
}

/** Same, without the currency symbol — for inputs and compact columns. */
export function formatAmount(value: string | null | undefined): string {
  return formatMoney(value, '');
}

/** "5" -> "5%", "7.50" -> "7.5%", "0" -> "0%". Trailing zeros trimmed. */
export function formatPercent(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  const trimmed = value.trim();
  const cleaned = trimmed.includes('.')
    ? trimmed.replace(/0+$/, '').replace(/\.$/, '')
    : trimmed;

  return `${cleaned || '0'}%`;
}

/** Renders a line's discount rule as the prototype did: amount, plus the rate. */
export function formatDiscount(
  discount: { type: 'percent' | 'fixed'; value: string } | null,
  discountAmount: string,
): string {
  if (!discount) return '—';

  const amount = formatMoney(discountAmount);
  return discount.type === 'percent'
    ? `-${amount} (${formatPercent(discount.value)})`
    : `-${amount}`;
}

/** '2026-08-01' -> '1 Aug 2026'. Parsed as UTC so the day never shifts. */
export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/** Today as 'YYYY-MM-DD', matching the API's calendar-date format. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
