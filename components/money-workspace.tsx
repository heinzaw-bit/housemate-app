'use client';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ApiRequestError,
  type BalanceSummary,
  formatCurrency,
  getBalances,
  type Household,
} from '@/lib/api';
import { moneyHref } from '@/lib/dashboard';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';
import { WorkspaceLoading } from './workspace-loading';

const BalanceWorkspace = dynamic(
  () => import('./balance-workspace').then((module) => module.BalanceWorkspace),
  { loading: WorkspaceLoading },
);
const BillWorkspace = dynamic(
  () => import('./bill-workspace').then((module) => module.BillWorkspace),
  { loading: WorkspaceLoading },
);
const ExpenseWorkspace = dynamic(
  () => import('./expense-workspace').then((module) => module.ExpenseWorkspace),
  { loading: WorkspaceLoading },
);

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
  const params = useSearchParams();
  const router = useRouter();
  const requestedView = params.get('view');
  const view =
    requestedView === 'bills' || requestedView === 'expenses'
      ? requestedView
      : 'balances';
  const recordId = params.get('record') ?? undefined;
  const startCreate = !recordId && params.get('add') === '1';
  const eventId =
    view === 'expenses' && startCreate
      ? (params.get('event') ?? undefined)
      : undefined;
  const [summary, setSummary] = useState<BalanceSummary | null>(null);
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
  useRefreshOnReturn(refreshSummary);
  useEffect(() => {
    void refreshSummary();
    return () => {
      requestNumber.current += 1;
    };
  }, [refreshSummary]);
  const viewer = summary?.members.find(
    (member) => member.memberId === summary.viewerMemberId,
  );
  const currency = summary?.currency ?? household.defaultCurrency;
  const money = (amount: number) =>
    `${formatCurrency(amount, currency)} ${currency}`;
  const setView = (next: 'expenses' | 'bills' | 'balances') =>
    router.push(moneyHref(household.id, next), { scroll: false });
  return (
    <div>
      <div className="content-inner space-y-5 pt-5">
        <div className="page-heading-row">
          <div>
            <span className="eyebrow">SHARED MONEY, CLEAR RECORDS</span>
            <h1>Money</h1>
            <p>See balances, review records, and add household costs.</p>
          </div>
          <Badge variant="secondary" className="currency-badge">
            {household.defaultCurrency} HOUSEHOLD
          </Badge>
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
        <section
          aria-label="Money overview"
          className="grid gap-3 sm:grid-cols-2"
        >
          <Card className="gap-2 bg-primary/5">
            <CardContent className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Your balance
              </p>
              {viewer ? (
                <>
                  <p className="text-2xl font-semibold">
                    {money(Math.abs(viewer.netMinor))}
                  </p>
                  <p className="text-sm">
                    {viewer.netMinor < 0
                      ? 'You owe the household'
                      : viewer.netMinor > 0
                        ? 'The household owes you'
                        : 'You’re settled up'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {summaryLoading ? 'Loading balance…' : 'Balance unavailable.'}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="gap-2">
            <CardContent className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Unpaid bills
              </p>
              {summary ? (
                <>
                  <p className="text-2xl font-semibold">
                    {money(summary.pendingBillAmountMinor)}
                  </p>
                  <p className="text-sm">
                    {summary.pendingBillCount} across the household · excluded
                    from balances until Paid
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {summaryLoading
                    ? 'Loading bills…'
                    : 'Bill total unavailable.'}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
        <nav
          aria-label="Money sections"
          className="flex flex-wrap gap-2 border-b pb-4"
        >
          <Button
            variant={view === 'balances' ? 'default' : 'outline'}
            aria-current={view === 'balances' ? 'page' : undefined}
            onClick={() => setView('balances')}
          >
            Balances
          </Button>
          <Button
            variant={view === 'expenses' ? 'default' : 'outline'}
            aria-current={view === 'expenses' ? 'page' : undefined}
            onClick={() => setView('expenses')}
          >
            Expenses
          </Button>
          <Button
            variant={view === 'bills' ? 'default' : 'outline'}
            aria-current={view === 'bills' ? 'page' : undefined}
            onClick={() => setView('bills')}
          >
            Bills
          </Button>
        </nav>
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
      ) : (
        <BalanceWorkspace
          key={`balances:${recordId ?? ''}`}
          household={household}
          token={token}
          initialRecordId={recordId}
          onMoneyChanged={refreshSummary}
        />
      )}
    </div>
  );
}
