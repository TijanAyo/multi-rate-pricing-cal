'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { StatusTag } from '@/components/status-tag';
import { api } from '@/lib/api';
import { formatDate, formatMoney, todayIso } from '@/lib/money';
import type { DocumentSummary } from '@/lib/types';

/** The prototype's `isList` branch. */
export default function DocumentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.listDocuments(),
  });

  const createDocument = useMutation({
    // The prototype creates a draft immediately and drops the user into the
    // editor, rather than showing a separate "new document" form first.
    mutationFn: () =>
      api.createDocument({
        title: 'Untitled document',
        customer: 'New customer',
        issueDate: todayIso(),
      }),
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.push(`/documents/${document.id}`);
    },
  });

  return (
    <>
      <div className="stack-between" style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Documents</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => createDocument.mutate()}
          disabled={createDocument.isPending}
        >
          {createDocument.isPending ? 'Creating…' : 'New document'}
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="hr" style={{ marginBottom: 'var(--space-6)' }} />

      {error && (
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      )}

      {isLoading && <p className="text-muted">Loading documents…</p>}

      {documents && documents.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <div className="card-title" style={{ marginBottom: 'var(--space-2)' }}>
            No documents yet
          </div>
          <p className="card-body" style={{ marginBottom: 'var(--space-4)' }}>
            Create your first quote or invoice to get started.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => createDocument.mutate()}
              disabled={createDocument.isPending}
            >
              New document
            </button>
          </div>
        </div>
      )}

      {documents && documents.length > 0 && (
        <table className="table doc-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Customer</th>
              <th>Issue date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Grand total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.map((document: DocumentSummary) => (
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
                {/* Rendered from the server's stored string — the browser never
                    computes or re-parses an amount. */}
                <td className="money">{formatMoney(document.grandTotal)}</td>
                <td style={{ textAlign: 'right' }}>
                  <ChevronRight size={16} strokeWidth={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
