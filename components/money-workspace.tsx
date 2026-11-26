'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { PersonalBalanceCard } from '@/components/personal-balance-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WorkspaceLoading } from '@/components/workspace-loading';
import {
  ApiRequestError,
  type BalanceSummary,
  formatCurrency,
  getBalances,
  type Household,
} from '@/lib/api';
import { balancePresentation } from '@/lib/balance-presentation';
import { moneyHref } from '@/lib/dashboard';
import { usePendingWork } from '@/lib/pending-work';
import { householdReadPath, recentRead } from '@/lib/recent-reads';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';

const BalanceWorkspace = dynamic(
  () => import('./balance-workspace').then((module) => module.BalanceWorkspace),
  { loading: () => <WorkspaceLoading kind="money" /> },
);
const RecordTransferWorkspace = dynamic(
  () =>
    import('./balance-workspace').then(
      (module) => module.RecordTransferWorkspace,
    ),
  { loading: () => <WorkspaceLoading kind="money" /> },
);
const BillWorkspace = dynamic(
  () => import('./bill-workspace').then((module) => module.BillWorkspace),
  { loading: () => <WorkspaceLoading /> },
);
const ExpenseWorkspace = dynamic(
  () => import('./expense-workspace').then((module) => module.ExpenseWorkspace),
  { loading: () => <WorkspaceLoading /> },
);

const moneySections = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'bills', label: 'Bills' },
  { id: 'balances', label: 'Settlements' },
  { id: 'record-transfer', label: 'Record transfer' },
] as const;
type MoneyView = (typeof moneySections)[number]['id'];

export function MoneyWorkspace({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  return (
    <Suspense fallback={<p role="status">Loading Money…</p>}>
      <MoneyContent household={household} token={token} />
    </Suspense>
  );
}

function MoneyContent({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const pending = usePendingWork();
  const params = useSearchParams();
  const router = useRouter();
  const sections = moneySections.filter(
    ({ id }) => id !== 'record-transfer' || household.role === 'owner',
  );
  const requestedView = params.get('view');
  const view =
    sections.find(({ id }) => id === requestedView)?.id ?? 'overview';
  const recordId = params.get('record') ?? undefined;
  const startCreate = !recordId && params.get('add') === '1';
  const eventId =
    view === 'expenses' && startCreate
      ? (params.get('event') ?? undefined)
      : undefined;
  const readPath = householdReadPath(household.id, 'balances');
  const [summary, setSummary] = useState<BalanceSummary | null>(
    () => recentRead<BalanceSummary>(token, readPath)?.value ?? null,
  );
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const requestNumber = useRef(0);
  const refreshSummary = useCallback(async () => {
    const request = ++requestNumber.current;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const next = await getBalances(token, household.id);
      if (request === requestNumber.current) setSummary(next);
    } catch (error) {
      if (request !== requestNumber.current) return;
      if (
        error instanceof ApiRequestError &&
        [401, 403, 404].includes(error.status)
      )
        setSummary(null);
      setSummaryError(
        error instanceof Error
          ? error.message
          : 'Could not load money summary.',
      );
    } finally {
      if (request === requestNumber.current) setSummaryLoading(false);
    }
  }, [household.id, token]);
  useRefreshOnReturn(refreshSummary, !pending, 15_000, household.id);
  useEffect(() => {
    void refreshSummary();
    return () => {
      requestNumber.current += 1;
    };
  }, [refreshSummary]);
  const viewer = summary?.members.find(
    (member) => member.memberId === summary.viewerMemberId,
  );
  const displayed = viewer
    ? balancePresentation(viewer, summary?.pendingBillCount ?? 0)
    : null;
  const currency = summary?.currency ?? household.defaultCurrency;
  const money = (amount: number) =>
    `${formatCurrency(amount, currency)} ${currency}`;
  const setView = (next: MoneyView) => {
    if (pending) return;
    router.push(
      next === 'overview'
        ? `/money?household=${encodeURIComponent(household.id)}`
        : moneyHref(household.id, next),
      { scroll: false },
    );
  };
  return (
    <div>
      <div className="content-inner space-y-5 pt-5">
        <div className="page-heading-row">
          <div>
            <span className="eyebrow">HOUSEHOLD FINANCES</span>
            <h1>Money</h1>
            <p>Everything you share, in one clear place.</p>
          </div>
        </div>
        {summaryError && (
          <p role="alert" className="text-sm text-destructive">
            {summaryError} {summary ? 'These totals may be out of date.' : ''}{' '}
            <Button
              variant="link"
              size="sm"
              onClick={() => void refreshSummary()}
            >
              Retry
            </Button>
          </p>
        )}
        <nav
          aria-label="Money sections"
          className="design-money-tabs flex overflow-x-auto"
        >
          {sections.map(({ id, label }) => (
            <Button
              key={id}
              disabled={pending}
              variant="ghost"
              className="shrink-0 whitespace-nowrap"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </Button>
          ))}
        </nav>
        {pending && (
          <p role="status" className="design-muted">
            Finish or discard the open draft before switching Money sections.
          </p>
        )}
        <section
          aria-label="Money overview"
          className="design-money-summary grid gap-4 sm:grid-cols-2"
        >
          <PersonalBalanceCard
            balance={displayed}
            currency={currency}
            compact
            loading={summaryLoading}
          />
          <Card className="gap-2">
            <CardContent className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Unpaid bills
              </p>
              <div className="space-y-1" aria-live="polite" aria-atomic="true">
                {summary ? (
                  <>
                    <p className="text-2xl font-semibold">
                      {money(summary.pendingBillAmountMinor)}
                    </p>
                    <p className="text-sm">
                      {summary.pendingBillCount === 0
                        ? 'No provider bills to pay'
                        : summary.pendingBillCount === 1
                          ? '1 bill still due to a provider'
                          : `${summary.pendingBillCount} bills still due to providers`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {summaryLoading
                      ? 'Loading bills…'
                      : 'Bill total unavailable.'}
                  </p>
                )}
              </div>
              {!!summary?.pendingBillCount && (
                <>
                  <p className="text-xs text-muted-foreground">
                    A bill leaves this total when an owner or admin marks it
                    Paid.
                  </p>
                  {view !== 'bills' && (
                    <Button
                      variant="link"
                      size="sm"
                      className="-ml-3"
                      disabled={pending}
                      onClick={() => setView('bills')}
                    >
                      Review bills
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
      {view === 'expenses' ? (
        <ExpenseWorkspace
          key={`expenses:${recordId ?? ''}:${startCreate}:${eventId ?? ''}`}
          household={household}
          token={token}
          initialRecordId={recordId}
          initialCreate={startCreate}
          initialEventId={eventId}
          onMoneyChanged={refreshSummary}
        />
      ) : view === 'bills' ? (
        <BillWorkspace
          key={`bills:${recordId ?? ''}:${startCreate}`}
          household={household}
          token={token}
          initialRecordId={recordId}
          initialCreate={startCreate}
          onMoneyChanged={refreshSummary}
        />
      ) : view === 'record-transfer' ? (
        <RecordTransferWorkspace
          household={household}
          token={token}
          summary={summary}
          loading={summaryLoading}
          onMoneyChanged={refreshSummary}
        />
      ) : (
        <BalanceWorkspace
          key={`balances:${view}:${recordId ?? ''}`}
          household={household}
          token={token}
          initialRecordId={recordId}
          settlementView={view === 'balances'}
        />
      )}
    </div>
  );
}
