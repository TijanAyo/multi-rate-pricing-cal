import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';

import '@/styles/modernist.css';
import '@/styles/app.css';

import { Providers } from './providers';

/**
 * Modernist is set entirely in Archivo. Loading it through `next/font` rather
 * than the stylesheet's original `@import` self-hosts the files, so there is no
 * render-blocking request to fonts.googleapis.com and no flash of fallback.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  display: 'swap',
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  title: 'Rate Sheet',
  description: 'Create documents with line items, per-line discounts and tax, and totals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
