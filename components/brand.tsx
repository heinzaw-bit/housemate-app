'use client';

import { hasPendingWork, usePendingWork } from '@/lib/pending-work';
import { HouseMateMascot } from './housemate-mascot';

export function Brand({
  compact = false,
  refreshable = false,
}: {
  compact?: boolean;
  refreshable?: boolean;
}) {
  const pending = usePendingWork();
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      {refreshable ? (
        <button
          type="button"
          className="brand-icon brand-refresh"
          aria-label="Refresh current page"
          title={
            pending
              ? 'Finish or discard your open draft before refreshing.'
              : 'Refresh current page'
          }
          disabled={pending}
          onClick={() => {
            if (!hasPendingWork()) window.location.reload();
          }}
        >
          <HouseMateMascot />
        </button>
      ) : (
        <span className="brand-icon">
          <HouseMateMascot />
        </span>
      )}
      {!compact && (
        <span className="brand-name">
          housemate<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
