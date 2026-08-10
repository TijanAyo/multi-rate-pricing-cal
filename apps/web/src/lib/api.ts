import type {
  AuthResult,
  DocumentSummary,
  DocumentStatus,
  LineItemInput,
  PreviewResult,
  PricingDocument,
  SummaryReport,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'pricing.accessToken';

/**
 * A server error, carrying the envelope's machine-readable `code` and the
 * `field` it belongs to.
 *
 * The UI switches on `code` and attaches `message` to the control named by
 * `field` — it never parses the message text, which is free to be reworded.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly field?: string,
    public readonly lineIndex?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Public endpoints (login, signup) skip the Authorization header. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code: string; message: string; field?: string; lineIndex?: number } }
    | null;

  if (!response.ok) {
    const error = payload?.error;

    // An expired or revoked token: drop it so the UI falls back to the login
    // screen instead of looping on 401s.
    if (response.status === 401) tokenStore.clear();

    throw new ApiError(
      error?.message ?? 'Something went wrong. Please try again.',
      error?.code ?? 'UNKNOWN_ERROR',
      response.status,
      error?.field,
      error?.lineIndex,
    );
  }

  return payload?.data as T;
}

export const api = {
  // ── auth ───────────────────────────────────────────────────────────────
  signup: (email: string, password: string) =>
    request<AuthResult>('/auth/signup', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    }),

  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    }),

  me: () => request<{ id: string; email: string }>('/auth/me'),

  // ── documents ──────────────────────────────────────────────────────────
  listDocuments: (status?: DocumentStatus) =>
    request<DocumentSummary[]>(`/documents${status ? `?status=${status}` : ''}`),

  getDocument: (id: string) => request<PricingDocument>(`/documents/${id}`),

  createDocument: (input: {
    title: string;
    customer: string;
    issueDate: string;
    lineItems?: LineItemInput[];
  }) => request<PricingDocument>('/documents', { method: 'POST', body: input }),

  updateDocument: (
    id: string,
    input: Partial<{ title: string; customer: string; issueDate: string }>,
  ) => request<PricingDocument>(`/documents/${id}`, { method: 'PATCH', body: input }),

  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),

  finalizeDocument: (id: string) =>
    request<PricingDocument>(`/documents/${id}/finalize`, { method: 'POST' }),

  duplicateDocument: (id: string) =>
    request<PricingDocument>(`/documents/${id}/duplicate`, { method: 'POST' }),

  // ── line items (each returns the whole document, totals included) ───────
  addLineItem: (documentId: string, input: LineItemInput) =>
    request<PricingDocument>(`/documents/${documentId}/line-items`, {
      method: 'POST',
      body: input,
    }),

  updateLineItem: (documentId: string, lineItemId: string, input: Partial<LineItemInput>) =>
    request<PricingDocument>(`/documents/${documentId}/line-items/${lineItemId}`, {
      method: 'PATCH',
      body: input,
    }),

  removeLineItem: (documentId: string, lineItemId: string) =>
    request<PricingDocument>(`/documents/${documentId}/line-items/${lineItemId}`, {
      method: 'DELETE',
    }),

  // ── totals ─────────────────────────────────────────────────────────────
  /**
   * Stateless preview. The client sends the line INPUTS and the server returns
   * the amounts — the arithmetic never happens in the browser.
   */
  preview: (lineItems: LineItemInput[]) =>
    request<PreviewResult>('/calc/preview', { method: 'POST', body: { lineItems } }),

  // ── reports ────────────────────────────────────────────────────────────
  summary: (from: string, to: string) =>
    request<SummaryReport>(`/reports/summary?from=${from}&to=${to}`),
};
