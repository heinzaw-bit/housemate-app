'use client';

import { ChevronRight, Plus, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PersonalBalanceCard } from '@/components/personal-balance-card';
import { formatCurrency, type Household } from '@/lib/api';
import { balancePresentation } from '@/lib/balance-presentation';
import { previewDashboard } from '@/lib/preview-dashboard';

export function MoneyPreview({ household }: { household: Household }) {
  const [view, setView] = useState('overview');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (requested && ['expenses', 'bills', 'balances'].includes(requested))
      setView(requested);
  }, []);
  function selectView(next: string) {
    setView(next);
    const url = new URL(window.location.href);
    for (const key of ['record', 'add', 'event']) url.searchParams.delete(key);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }
  const data = previewDashboard(household);
  const member = data.balance.members[0];
  const money = (value: number) =>
    formatCurrency(value, household.defaultCurrency);
  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">HOUSEHOLD FINANCES</span>
          <h1>Money</h1>
          <p>Everything you share, in one clear place.</p>
        </div>
        {view === 'expenses' && (
          <Link className="primary-button" href="/sign-in">
            <Plus size={18} aria-hidden="true" /> Add expense
          </Link>
        )}
      </div>
      <nav
        className="design-money-tabs flex flex-wrap"
        aria-label="Money sections"
      >
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'expenses', label: 'Expenses' },
          { id: 'bills', label: 'Bills' },
          { id: 'balances', label: 'Settlements' },
        ].map(({ id, label }) => (
          <button
            type="button"
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => selectView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="design-preview-money-summary">
        <PersonalBalanceCard
          balance={balancePresentation(member, data.balance.pendingBillCount)}
          currency={household.defaultCurrency}
          compact
          sample
        />
        <section className="design-panel">
          <h2>Unpaid bills</h2>
          <p className="design-large-count">
            {money(data.balance.pendingBillAmountMinor)}
          </p>
          <p className="design-muted">1 bill still due to a provider</p>
        </section>
      </div>
      <section className="design-panel">
        <div className="design-section-heading">
          <h2>
            {view === 'overview'
              ? 'Recent activity'
              : view === 'balances'
                ? 'Recorded transfers'
                : view === 'expenses'
                  ? 'Expenses'
                  : 'Bills'}
          </h2>
        </div>
        {view === 'balances' || view === 'overview' ? (
          <p className="design-muted">No sample transfers.</p>
        ) : (
          <div className="design-record-row">
            <span className="design-item-icon green">
              <ReceiptText size={18} aria-hidden="true" />
            </span>
            <span className="design-row-copy">
              <strong>
                {view === 'bills' ? 'Electricity' : 'Weekly groceries'}
              </strong>
              <small>
                Sample record · {view === 'bills' ? 'Unpaid' : 'Shared expense'}
              </small>
            </span>
            <strong>{money(view === 'bills' ? 205250 : 98000)}</strong>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        )}
        <p className="design-muted">
          Read-only sample data. Sign in to review real records and preview any
          financial change.
        </p>
      </section>
    </div>
  );
}
