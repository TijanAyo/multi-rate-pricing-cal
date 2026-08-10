'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';

/**
 * The prototype's `.app-shell` — a 220px sidebar beside the content area — plus
 * the auth gate every screen inside it needs.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Rendering the shell before the session is known would flash the app at a
  // signed-out visitor for a frame before the redirect lands.
  if (loading || !user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-neutral-600)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  const documentsActive = pathname.startsWith('/documents');
  const reportActive = pathname.startsWith('/reports');

  return (
    <div className="app-shell">
      <nav className="side-nav">
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            padding: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
          }}
        >
          Rate Sheet
        </div>

        <Link
          href="/documents"
          className={`side-nav-link${documentsActive ? ' active' : ''}`}
          aria-current={documentsActive ? 'page' : undefined}
        >
          Documents
        </Link>
        <Link
          href="/reports"
          className={`side-nav-link${reportActive ? ' active' : ''}`}
          aria-current={reportActive ? 'page' : undefined}
        >
          Summary Report
        </Link>

        <div style={{ flex: 1 }} />

        <div
          className="text-muted"
          style={{
            fontSize: 12,
            padding: 'var(--space-2)',
            overflowWrap: 'anywhere',
          }}
        >
          {user.email}
        </div>
        <button type="button" className="side-nav-link" onClick={logOut}>
          Log out
        </button>
      </nav>

      <div className="main-area">{children}</div>
    </div>
  );
}
