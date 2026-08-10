import type { DocumentStatus } from '@/lib/types';

/** Accent tag for finalized, neutral for draft — the prototype's convention. */
export function StatusTag({ status }: { status: DocumentStatus }) {
  const finalized = status === 'finalized';
  return (
    <span className={`tag ${finalized ? 'tag-accent' : 'tag-neutral'}`}>
      {finalized ? 'Finalized' : 'Draft'}
    </span>
  );
}
