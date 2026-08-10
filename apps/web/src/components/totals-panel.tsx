import { formatMoney } from '@/lib/money';

interface Props {
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
}

/**
 * The prototype's totals block.
 *
 * Every figure here came from the server — either from the persisted document
 * or from POST /calc/preview, both of which run the same calculation module.
 * Nothing in this component adds anything up.
 */
export function TotalsPanel({ subtotal, totalDiscount, totalTax, grandTotal }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div className="totals-panel">
        <div className="totals-row">
          <span>Subtotal</span>
          <span className="money">{formatMoney(subtotal)}</span>
        </div>
        <div className="totals-row">
          <span>Total discount</span>
          <span className="money">&minus;{formatMoney(totalDiscount)}</span>
        </div>
        <div className="totals-row">
          <span>Total tax</span>
          <span className="money">{formatMoney(totalTax)}</span>
        </div>

        <div className="hr" style={{ margin: 'var(--space-3) 0' }} />

        <div className="totals-row-grand">
          <span>Grand total</span>
          <span className="money">{formatMoney(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
