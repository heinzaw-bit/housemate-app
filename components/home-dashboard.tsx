'use client';

import {
  ArrowUpRight,
  ClipboardList,
  ReceiptText,
  RefreshCw,
  ShoppingBasket,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ApiRequestError,
  type Dashboard,
  formatCurrency,
  getDashboard,
  type Household,
} from '@/lib/api';
import {
  activityHref,
  activityLabel,
  dashboardStaleAfterMs,
  moneyHref,
} from '@/lib/dashboard';
import { formatRecordDate } from '@/lib/date-format';

export function HomeDashboard({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const refreshedAt = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly starts a fresh request lifecycle.
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || !active) return;
      pending = true;
      setLoading(true);
      setError('');
      try {
        const next = await getDashboard(token, household.id, controller.signal);
        if (!active) return;
        setData(next);
        refreshedAt.current = Date.now();
        setStale(false);
      } catch (failure) {
        if (!active) return;
        if (
          failure instanceof ApiRequestError &&
          [401, 403, 404].includes(failure.status)
        )
          setData(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load your dashboard.',
        );
        setStale(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    function resume() {
      if (document.visibilityState === 'visible') void refresh();
    }
    function offline() {
      setStale(true);
    }
    const timer = window.setInterval(() => {
      if (Date.now() - refreshedAt.current >= dashboardStaleAfterMs) {
        setStale(true);
        if (document.visibilityState === 'visible' && navigator.onLine)
          void refresh();
      }
    }, 15_000);
    void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [token, household.id, retry]);

  const viewer = data?.balance.members.find(
    (member) => member.memberId === data.balance.viewerMemberId,
  );
  const currency = data?.balance.currency ?? household.defaultCurrency;
  const money = (amount: number) =>
    `${formatCurrency(amount, currency)} ${currency}`;
  const time = (value: string) =>
    new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data?.timezone ?? household.timezone,
    }).format(new Date(value));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {!data
            ? loading
              ? `Loading ${household.name} overview…`
              : 'Dashboard unavailable.'
            : `${stale ? 'May be out of date. Last updated' : 'Updated'} ${time(data.generatedAt)} · ${data.timezone}${loading ? ' · Refreshing…' : ''}`}
        </p>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-message error">
          {error}{' '}
          {data
            ? 'Showing the last successful update; totals may have changed.'
            : 'Use Refresh to try again.'}
        </p>
      )}
      {loading && !data && (
        <Card aria-busy="true">
          <CardContent className="py-8 text-muted-foreground">
            Checking balances, bills, and household plans…
          </CardContent>
        </Card>
      )}
      {data && (
        <>
          <section
            aria-labelledby="needs-attention-heading"
            className="space-y-3"
          >
            <div>
              <h2 id="needs-attention-heading" className="font-heading text-xl">
                Needs attention
              </h2>
              <p className="text-sm text-muted-foreground">
                Upcoming items across {household.name}. Check who is responsible
                in each detail.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="gap-3 border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <ReceiptText size={19} aria-hidden="true" /> Bills to
                      watch
                    </CardTitle>
                    <Badge
                      variant={
                        data.pendingBills.overdueCount
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {data.pendingBills.overdueCount} overdue
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data.pendingBills.dueSoonCount} due today or within{' '}
                    {data.dueSoonDays} days
                  </p>
                </CardHeader>
                <CardContent className="flex-1">
                  {data.pendingBills.items.length ? (
                    <ul className="divide-y">
                      {data.pendingBills.items.slice(0, 3).map((bill) => (
                        <li key={bill.id}>
                          <Link
                            className="dashboard-record-link"
                            href={moneyHref(household.id, 'bills', bill.id)}
                          >
                            <span className="min-w-0">
                              <strong className="block break-words">
                                {bill.title}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {bill.provider} · Due{' '}
                                {formatRecordDate(bill.dueDate)}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  bill.urgency === 'overdue'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {bill.urgency === 'overdue'
                                  ? 'Overdue'
                                  : bill.urgency === 'due_soon'
                                    ? 'Due soon'
                                    : 'Upcoming'}
                              </Badge>
                              <strong className="text-sm">
                                {money(bill.amountMinor)}
                              </strong>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-3 text-sm text-muted-foreground">
                      No unpaid bills. You’re up to date.
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Link
                    className="inline-link"
                    href={moneyHref(household.id, 'bills')}
                  >
                    View all bills <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </CardFooter>
              </Card>
              <Card className="gap-3 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList size={19} aria-hidden="true" /> Next chore
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm">
                  {data.chores.nextDue ? (
                    <>
                      <p className="font-medium">{data.chores.nextDue.title}</p>
                      <p className="text-muted-foreground">
                        {data.chores.nextDue.assigneeDisplayName} · Due{' '}
                        {time(data.chores.nextDue.dueAt)}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No open chores.</p>
                  )}
                  {data.chores.overdueCount > 0 && (
                    <Badge variant="destructive">
                      {data.chores.overdueCount} overdue
                    </Badge>
                  )}
                </CardContent>
                <CardFooter>
                  <Link
                    className="inline-link"
                    href={`/house?household=${encodeURIComponent(household.id)}&chores=1`}
                  >
                    Open chores <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </CardFooter>
              </Card>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UtensilsCrossed size={19} aria-hidden="true" /> Next meal
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm">
                  {data.nextMeal ? (
                    <>
                      <p className="font-medium">{data.nextMeal.question}</p>
                      <p className="text-muted-foreground">
                        {time(data.nextMeal.startsAt)} ·{' '}
                        {data.nextMeal.awaitingCount} awaiting responses
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      No upcoming meal check.
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Link
                    className="inline-link"
                    href={
                      data.nextMeal
                        ? `/house?household=${encodeURIComponent(household.id)}&meal=${encodeURIComponent(data.nextMeal.id)}`
                        : `/house?household=${encodeURIComponent(household.id)}`
                    }
                  >
                    {data.nextMeal ? 'Open meal check' : 'Plan a meal'}{' '}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </section>

          <section aria-labelledby="snapshot-heading" className="space-y-3">
            <h2 id="snapshot-heading" className="font-heading text-xl">
              At a glance
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="gap-3 bg-primary/5">
                <CardHeader>
                  <CardTitle>Your balance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {viewer ? (
                    <>
                      <p className="text-3xl font-semibold">
                        {money(Math.abs(viewer.netMinor))}
                      </p>
                      <p className="text-sm font-medium">
                        {viewer.netMinor < 0
                          ? 'You owe the household'
                          : viewer.netMinor > 0
                            ? 'The household owes you'
                            : 'You’re settled up'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm">Your balance is unavailable.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Confirmed expenses, Paid bills, and reported transfers.
                  </p>
                  <Link
                    className="inline-link"
                    href={moneyHref(household.id, 'balances')}
                  >
                    Balance breakdown{' '}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>Unpaid bills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-semibold">
                    {money(data.balance.pendingBillAmountMinor)}
                  </p>
                  <p className="text-sm font-medium">
                    {data.balance.pendingBillCount} across the household
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unpaid bills affect balances only when marked Paid.
                  </p>
                  <Link
                    className="inline-link"
                    href={moneyHref(household.id, 'bills')}
                  >
                    Review bills <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>Household work</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <ShoppingBasket size={17} aria-hidden="true" /> Shopping
                    </span>
                    <strong>{data.shoppingOpenCount} to buy</strong>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <ClipboardList size={17} aria-hidden="true" /> Chores
                    </span>
                    <strong>{data.chores.openCount} open</strong>
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                    <Link
                      className="inline-link"
                      href={`/house?household=${encodeURIComponent(household.id)}&shopping=1`}
                    >
                      Shopping list{' '}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                    <Link
                      className="inline-link"
                      href={`/house?household=${encodeURIComponent(household.id)}&chores=1`}
                    >
                      Chores <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="activity-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="activity-heading" className="font-heading text-xl">
                  Recent activity
                </h2>
                <p className="text-sm text-muted-foreground">
                  Financial changes across the household.
                </p>
              </div>
              {data.recentActivity.length > 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllActivity((old) => !old)}
                >
                  {showAllActivity
                    ? 'Show less'
                    : `Show ${data.recentActivity.length} recent updates`}
                </Button>
              )}
            </div>
            <Card>
              <CardContent>
                {data.recentActivity.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No financial activity yet. Add your first expense or bill.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.recentActivity
                      .slice(0, showAllActivity ? undefined : 3)
                      .map((event) => (
                        <li key={event.id}>
                          <Link
                            className="dashboard-record-link"
                            href={activityHref(household.id, event)}
                          >
                            <span className="min-w-0">
                              <strong className="block break-words">
                                {event.title}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {activityLabel(event)}
                              </span>
                            </span>
                            <time
                              className="text-xs text-muted-foreground"
                              dateTime={event.occurredAt}
                            >
                              {time(event.occurredAt)}
                            </time>
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
