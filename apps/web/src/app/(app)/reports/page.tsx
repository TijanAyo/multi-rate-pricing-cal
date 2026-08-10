'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { StatusTag } from '@/components/status-tag';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/money';

/** The prototype's `isReport` branch. */
export default function ReportsPage() {
  const router = useRouter();

  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo] = useState('2026-12-31');

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['summary', from, to],
    queryFn: () => api.summary(from, to),
    enabled: Boolean(from && to),
  });

  return (
    <>
      <h1 style={{ margin: '0 0 var(--space-6)', fontSize: 28 }}>Summary Report</h1>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          alignItems: 'flex-end',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            className="input"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="report-to">To</label>
          <input
            id="report-to"
            className="input"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <StatTile label="Documents" value={report ? String(report.documentCount) : '—'} />
        <StatTile
          label="Grand totals"
          value={report ? formatMoney(report.totalGrandTotal) : '—'}
        />
        <StatTile label="Total tax" value={report ? formatMoney(report.totalTax) : '—'} />
        <StatTile
          label="Total discount"
          value={report ? formatMoney(report.totalDiscount) : '—'}
        />
      </div>

      <div className="hr" style={{ marginBottom: 'var(--space-4)' }} />

      {isLoading && <p className="text-muted">Loading report…</p>}

      {/* The rows the tiles above are made of. Showing both on one screen makes
          the aggregate checkable by eye rather than something to take on
          trust — the report sums exactly these stored values. */}
      {report && report.documents.length > 0 && (
        <table className="table doc-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Customer</th>
              <th>Issue date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Grand total</th>
            </tr>
          </thead>
          <tbody>
            {report.documents.map((document) => (
              <tr
                key={document.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/documents/${document.id}`)}
              >
                <td>{document.title}</td>
                <td>{document.customer || '—'}</td>
                <td className="text-muted">{formatDate(document.issueDate)}</td>
                <td>
                  <StatusTag status={document.status} />
                </td>
                <td className="money">{formatMoney(document.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report && report.documents.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: 14 }}>No documents in this range.</p>
      )}
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="card-kicker">{label}</div>
      <div className="card-title money" style={{ fontSize: 26, textAlign: 'left' }}>
        {value}
      </div>
    </div>
  );
}
