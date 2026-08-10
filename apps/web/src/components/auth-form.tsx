'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * The prototype's `isAuth` branch: a centred 360px card carrying the brand
 * kicker, the two fields, a full-width submit and a toggle to the other mode.
 * One component serves both /login and /signup.
 */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { logIn, signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === 'login';
  const title = isLogin ? 'Log in' : 'Sign up';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await (isLogin ? logIn(email, password) : signUp(email, password));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('Unable to reach the server.', 'NETWORK_ERROR', 0),
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div className="card elev-md" style={{ width: 360, padding: 'var(--space-6)' }}>
        <div className="card-kicker">Rate Sheet</div>
        <div className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          {title}
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className={`field${error?.field === 'email' ? ' field-err' : ''}`}
            style={{ marginBottom: 'var(--space-3)' }}
          >
            <label htmlFor="auth-email">Email</label>
            <input
              className="input"
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {error?.field === 'email' && <div className="err-text">{error.message}</div>}
          </div>

          <div
            className={`field${error?.field === 'password' ? ' field-err' : ''}`}
            style={{ marginBottom: 'var(--space-4)' }}
          >
            <label htmlFor="auth-pass">Password</label>
            <input
              className="input"
              id="auth-pass"
              type="password"
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error?.field === 'password' && <div className="err-text">{error.message}</div>}
          </div>

          {/* Errors without a field (bad credentials, server down) sit above
              the button rather than against an input that isn't at fault. */}
          {error && !error.field && (
            <div className="err-text" style={{ marginBottom: 'var(--space-2)' }} role="alert">
              {error.message}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Please wait…' : title}
          </button>
        </form>

        <p
          className="note"
          style={{ marginTop: 'var(--space-4)', fontSize: 13, opacity: 0.75 }}
        >
          {isLogin ? (
            <>
              Don&apos;t have an account? <Link href="/signup">Sign up</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href="/login">Log in</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
