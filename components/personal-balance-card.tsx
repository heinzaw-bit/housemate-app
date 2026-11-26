import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { type Currency, formatCurrency } from '@/lib/api';
import {
  balanceLabel,
  type balancePresentation,
} from '@/lib/balance-presentation';

export function PersonalBalanceCard({
  balance,
  currency,
  compact = false,
  loading = false,
  sample = false,
  breakdownHref,
}: {
  balance: ReturnType<typeof balancePresentation> | null;
  currency: Currency;
  compact?: boolean;
  loading?: boolean;
  sample?: boolean;
  breakdownHref?: string;
}) {
  const titleId = useId();
  const amountMinor = balance?.amountMinor ?? 0;
  const sign = compact || amountMinor === 0 ? '' : amountMinor > 0 ? '+' : '−';
  return (
    <section
      className={
        compact ? 'design-balance design-balance--summary' : 'design-balance'
      }
      aria-labelledby={titleId}
    >
      <div className="design-balance-content">
        <h2 id={titleId} className="design-balance-label">
          Your balance{sample ? ' · Sample' : ''}
        </h2>
        {balance ? (
          <>
            <p className="design-balance-amount">
              {sign}
              {formatCurrency(Math.abs(amountMinor), currency)}
              {compact && ` ${currency}`}
            </p>
            <p className="design-balance-status">
              {balanceLabel(balance.amountMinor, true)}
            </p>
            {balance.note && (
              <p className="design-balance-note">{balance.note}</p>
            )}
          </>
        ) : (
          <p className="design-balance-note">
            {loading ? 'Loading balance…' : 'Balance unavailable.'}
          </p>
        )}
      </div>
      {breakdownHref && (
        <Link className="design-balance-action" href={breakdownHref}>
          View breakdown <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
