'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatDiscount, formatMoney, formatPercent } from '@/lib/money';
import type { DiscountType, LineItem, LineItemInput } from '@/lib/types';

interface Props {
  line: LineItem;
  editable: boolean;
  /** Server-reported error for this row, keyed by the envelope's `field`. */
  error?: { field?: string; message: string };
  onChange: (patch: Partial<LineItemInput>) => void;
  onRemove: () => void;
  pending: boolean;
}

/**
 * One row of the line-item table.
 *
 * Local state mirrors the inputs so typing stays responsive, and changes are
 * committed on blur. The row never computes a total: `lineTotal` is whatever
 * the server last returned.
 */
export function LineItemRow({ line, editable, error, onChange, onRemove, pending }: Props) {
  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [unitPrice, setUnitPrice] = useState(line.unitPrice);
  const [discountValue, setDiscountValue] = useState(line.discount?.value ?? '');
  const [taxPercent, setTaxPercent] = useState(line.taxPercent ?? '');

  // Re-sync when the server sends back a canonicalised value (e.g. "10" -> "10.00").
  useEffect(() => {
    setDescription(line.description);
    setQuantity(String(line.quantity));
    setUnitPrice(line.unitPrice);
    setDiscountValue(line.discount?.value ?? '');
    setTaxPercent(line.taxPercent ?? '');
  }, [line]);

  const discountType: DiscountType = line.discount?.type ?? 'percent';

  /**
   * A blank value means "no discount" and is sent as `null`, matching the
   * schema's rule that the type tag and the value are both set or both absent.
   */
  function commitDiscount(type: DiscountType, value: string) {
    const trimmed = value.trim();
    onChange({ discount: trimmed === '' ? null : { type, value: trimmed } });
  }

  const discountError = error?.field?.startsWith('discount') ? error.message : undefined;
  const quantityError = error?.field === 'quantity' ? error.message : undefined;
  const priceError = error?.field === 'unitPrice' ? error.message : undefined;
  const taxError = error?.field === 'taxPercent' ? error.message : undefined;

  if (!editable) {
    return (
      <tr>
        <td>{line.description}</td>
        <td>
          <div className="money">{line.quantity}</div>
        </td>
        <td>
          <div className="money">{formatMoney(line.unitPrice)}</div>
        </td>
        <td>
          <div className="money">{formatDiscount(line.discount, line.discountAmount)}</div>
        </td>
        <td>
          <div className="money">{formatPercent(line.taxPercent)}</div>
        </td>
        <td className="money" style={{ fontWeight: 600 }}>
          {formatMoney(line.lineTotal)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input
          className="input"
          value={description}
          placeholder="Item description"
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => description !== line.description && onChange({ description })}
          disabled={pending}
        />
      </td>

      <td className={quantityError ? 'field-err' : undefined}>
        <input
          className="input li-money-input"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(quantity, 10);
            if (Number.isInteger(parsed) && parsed !== line.quantity) {
              onChange({ quantity: parsed });
            }
          }}
          disabled={pending}
        />
        {quantityError && <div className="err-text">{quantityError}</div>}
      </td>

      <td className={priceError ? 'field-err' : undefined}>
        <input
          className="input li-money-input"
          type="number"
          min={0}
          step="0.01"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          onBlur={() => unitPrice !== line.unitPrice && onChange({ unitPrice })}
          disabled={pending}
        />
        {priceError && <div className="err-text">{priceError}</div>}
      </td>

      <td className={discountError ? 'field-err' : undefined}>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* One value field plus a type tag: the UI physically cannot express
              "percent AND fixed at once", exactly like the schema. */}
          <div className="seg" style={{ flexShrink: 0 }}>
            <label className="seg-opt" style={{ padding: '6px 8px' }}>
              <input
                type="radio"
                name={`discount-type-${line.id}`}
                checked={discountType === 'percent'}
                onChange={() => commitDiscount('percent', discountValue)}
                disabled={pending}
              />
              %
            </label>
            <label className="seg-opt" style={{ padding: '6px 8px' }}>
              <input
                type="radio"
                name={`discount-type-${line.id}`}
                checked={discountType === 'fixed'}
                onChange={() => commitDiscount('fixed', discountValue)}
                disabled={pending}
              />
              $
            </label>
          </div>
          <input
            className="input li-money-input"
            type="number"
            min={0}
            step="0.01"
            placeholder="—"
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            onBlur={() => {
              if (discountValue.trim() !== (line.discount?.value ?? '')) {
                commitDiscount(discountType, discountValue);
              }
            }}
            disabled={pending}
          />
        </div>
        {discountError && <div className="err-text">{discountError}</div>}
      </td>

      <td className={taxError ? 'field-err' : undefined}>
        {/* No `max`: tax is bounded only at zero, since the assignment makes no
            tax-compliance assumptions. */}
        <input
          className="input li-money-input"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={taxPercent}
          onChange={(event) => setTaxPercent(event.target.value)}
          onBlur={() => {
            const next = taxPercent.trim();
            if (next !== (line.taxPercent ?? '')) {
              onChange({ taxPercent: next === '' ? null : next });
            }
          }}
          disabled={pending}
        />
        {taxError && <div className="err-text">{taxError}</div>}
      </td>

      <td className="money" style={{ fontWeight: 600 }}>
        {formatMoney(line.lineTotal)}
      </td>

      <td style={{ textAlign: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Remove ${line.description || 'line'}`}
          onClick={onRemove}
          disabled={pending}
          style={{ width: 28, height: 28, padding: 0 }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </td>
    </tr>
  );
}
