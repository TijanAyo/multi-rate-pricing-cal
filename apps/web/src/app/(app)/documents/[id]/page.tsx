'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Printer, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LineItemRow } from '@/components/line-item-row';
import { TotalsPanel } from '@/components/totals-panel';
import { ApiError, api } from '@/lib/api';
import type { LineItemInput, PricingDocument } from '@/lib/types';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<ApiError | null>(null);

  const { data: document, isLoading, error: loadError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id),
  });

  /** Every mutation returns the whole document, so the cache is simply replaced. */
  function useDocumentMutation<TArgs = void>(
    mutationFn: (args: TArgs) => Promise<PricingDocument>,
  ) {
    return useMutation({
      mutationFn,
      onMutate: () => setError(null),
      onSuccess: (updated) => {
        queryClient.setQueryData(['document', id], updated);
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
      },
      onError: (caught) => {
        if (caught instanceof ApiError) setError(caught);
      },
    });
  }

  const updateMetadata = useDocumentMutation((patch: Partial<PricingDocument>) =>
    api.updateDocument(id, patch),
  );
  const addLine = useDocumentMutation<void>(() =>
    api.addLineItem(id, {
      description: 'New item',
      quantity: 1,
      unitPrice: '0.00',
      discount: null,
      taxPercent: null,
    }),
  );
  const updateLine = useDocumentMutation(
    ({ lineId, patch }: { lineId: string; patch: Partial<LineItemInput> }) =>
      api.updateLineItem(id, lineId, patch),
  );
  const removeLine = useDocumentMutation((lineId: string) => api.removeLineItem(id, lineId));
  const finalize = useDocumentMutation<void>(() => api.finalizeDocument(id));

  const duplicate = useMutation({
    mutationFn: () => api.duplicateDocument(id),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.push(`/documents/${copy.id}`);
    },
    onError: (caught) => caught instanceof ApiError && setError(caught),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.push('/documents');
    },
  });

  if (isLoading) return <p className="text-muted">Loading document…</p>;

  if (loadError) {
    return (
      <div className="notice notice-error" role="alert">
        {loadError.message}
      </div>
    );
  }

  if (!document) return null;

  const isDraft = document.status === 'draft';
  const pending =
    updateMetadata.isPending ||
    addLine.isPending ||
    updateLine.isPending ||
    removeLine.isPending ||
    finalize.isPending;

  // The envelope's `lineIndex` points at the row that caused the failure, so
  // the message lands on that row rather than floating at the top of the page.
  const erroredLineId =
    error?.lineIndex !== undefined ? document.lineItems[error.lineIndex]?.id : undefined;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <Link
          href="/documents"
          style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Documents
        </Link>
      </div>

      {!isDraft && (
        <div className="notice">
          <Lock size={16} strokeWidth={2} />
          <strong style={{ fontSize: 13 }}>Finalized</strong>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            This document is locked and can&apos;t be edited.
          </span>
        </div>
      )}

      {/* Errors without a line index (finalize refusals, metadata failures). */}
      {error && erroredLineId === undefined && (
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-6)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '2fr 1.2fr 1fr',
            gap: 'var(--space-4)',
          }}
        >
          <MetadataField
            label="Title"
            value={document.title}
            editable={isDraft}
            emphasised
            onCommit={(title) => updateMetadata.mutate({ title })}
          />
          <MetadataField
            label="Customer"
            value={document.customer}
            editable={isDraft}
            onCommit={(customer) => updateMetadata.mutate({ customer })}
          />
          <MetadataField
            label="Issue date"
            value={document.issueDate}
            type="date"
            editable={isDraft}
            onCommit={(issueDate) => updateMetadata.mutate({ issueDate })}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexShrink: 0,
            paddingTop: 22,
          }}
        >
          <Link className="btn btn-secondary" href={`/print/${id}`} target="_blank">
            <Printer size={14} strokeWidth={2} />
            Print
          </Link>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => duplicate.mutate()}
            disabled={duplicate.isPending}
          >
            {isDraft ? 'Duplicate' : 'Duplicate to draft'}
          </button>

          {isDraft && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => finalize.mutate()}
                disabled={pending}
              >
                Finalize
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                aria-label="Delete document"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>

      <table className="table li-table" style={{ marginBottom: 'var(--space-6)' }}>
        <thead>
          <tr>
            <th style={{ width: '26%' }}>Description</th>
            <th style={{ width: '8%' }}>Qty</th>
            <th style={{ width: '12%' }}>Unit price</th>
            <th style={{ width: '18%' }}>Discount</th>
            <th style={{ width: '10%' }}>Tax %</th>
            <th style={{ width: '12%', textAlign: 'right' }}>Line total</th>
            {isDraft && <th style={{ width: '4%' }} />}
          </tr>
        </thead>
        <tbody>
          {document.lineItems.map((line) => (
            <LineItemRow
              key={line.id}
              line={line}
              editable={isDraft}
              error={erroredLineId === line.id ? error ?? undefined : undefined}
              pending={pending}
              onChange={(patch) => updateLine.mutate({ lineId: line.id, patch })}
              onRemove={() => removeLine.mutate(line.id)}
            />
          ))}
        </tbody>
      </table>

      {document.lineItems.length === 0 && (
        <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          No line items yet. Add one to start building this document.
        </p>
      )}

      {isDraft && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => addLine.mutate()}
          disabled={pending}
          style={{ marginBottom: 'var(--space-8)' }}
        >
          + Add line
        </button>
      )}

      <TotalsPanel
        subtotal={document.subtotal}
        totalDiscount={document.totalDiscount}
        totalTax={document.totalTax}
        grandTotal={document.grandTotal}
      />
    </>
  );
}

interface MetadataFieldProps {
  label: string;
  value: string;
  editable: boolean;
  type?: string;
  emphasised?: boolean;
  onCommit: (value: string) => void;
}

/** Editable input on a draft, static text once finalized. */
function MetadataField({
  label,
  value,
  editable,
  type = 'text',
  emphasised = false,
  onCommit,
}: MetadataFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <div className="field">
      <label htmlFor={`meta-${label}`}>{label}</label>
      {editable ? (
        <input
          id={`meta-${label}`}
          className="input"
          type={type}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft !== value && draft.trim() !== '' && onCommit(draft)}
        />
      ) : (
        <div
          style={
            emphasised
              ? { fontSize: 20, fontWeight: 700, padding: '8px 0' }
              : { padding: '8px 0' }
          }
        >
          {value}
        </div>
      )}
    </div>
  );
}
