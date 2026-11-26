'use client';

import {
  ArrowUpRight,
  ChevronRight,
  ClipboardCheck,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  Utensils,
  WalletCards,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PersonalBalanceCard } from '@/components/personal-balance-card';
import { type Dashboard, formatCurrency, type Household } from '@/lib/api';
import { balancePresentation } from '@/lib/balance-presentation';
import { activityHref, activityLabel, moneyHref } from '@/lib/dashboard';
import { formatRecordDate } from '@/lib/date-format';

export function HouseholdOverview({
  data,
  household,
  preview = false,
}: {
  data: Dashboard;
  household: Household;
  preview?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const viewer = data.balance.members.find(
    (member) => member.memberId === data.balance.viewerMemberId,
  );
  const displayed = viewer
    ? balancePresentation(viewer, data.balance.pendingBillCount)
    : null;
  const money = (amount: number) =>
    formatCurrency(amount, data.balance.currency);
  const href = (path: string) =>
    preview
      ? `/preview${path.split('?')[0]}${path.includes('?') ? `?${path.split('?')[1]}` : ''}`
      : path;
  const houseHref = (view: string, key?: string, id?: string) => {
    const params = new URLSearchParams({ household: household.id, view });
    if (key && id) params.set(key, id);
    return href(`/house?${params}`);
  };
  const billHref = href(moneyHref(household.id, 'bills'));
  const time = (value: string) =>
    new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data.timezone,
    }).format(new Date(value));
  const chore = data.chores.nextDue;
  return (
    <div className="design-overview">
      <PersonalBalanceCard
        balance={displayed}
        currency={data.balance.currency}
        breakdownHref={href(moneyHref(household.id, 'balances'))}
      />

      <section aria-labelledby="attention-heading">
        <div className="design-section-heading">
          <h2 id="attention-heading">Needs your attention</h2>
          <Link href={billHref}>
            View all bills <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="design-panel design-attention">
          {data.pendingBills.items.slice(0, 3).map((bill) => (
            <Link
              key={bill.id}
              className="design-record-row"
              href={href(moneyHref(household.id, 'bills', bill.id))}
            >
              <span className="design-item-icon coral">
                <Zap size={18} aria-hidden="true" />
              </span>
              <span className="design-row-copy">
                <strong>{bill.title}</strong>
                <small>
                  {bill.provider} · Due {formatRecordDate(bill.dueDate)} ·{' '}
                  {money(bill.amountMinor)} total
                </small>
              </span>
              <span className="design-urgency">
                {bill.urgency === 'overdue'
                  ? 'Overdue'
                  : bill.urgency === 'due_soon'
                    ? 'Due soon'
                    : 'Upcoming'}
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          ))}
          {chore && (
            <Link
              className="design-record-row"
              href={houseHref('chores', 'chore', chore.id)}
            >
              <span className="design-item-icon blue">
                <ClipboardCheck size={18} aria-hidden="true" />
              </span>
              <span className="design-row-copy">
                <strong>{chore.title}</strong>
                <small>
                  {chore.assigneeDisplayName} · Due {time(chore.dueAt)}
                </small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          )}
          {!data.pendingBills.items.length && !chore && (
            <p className="design-empty">
              You’re up to date. No unpaid bills or open chores.
            </p>
          )}
        </div>
      </section>

      <div className="design-home-grid">
        <section className="design-panel" aria-labelledby="meal-heading">
          <div className="design-section-heading">
            <h2 id="meal-heading">
              <span className="design-item-icon green">
                <Utensils size={18} aria-hidden="true" />
              </span>
              {data.nextMeal?.mealType === 'dinner'
                ? 'Dinner plans'
                : 'Next meal'}
            </h2>
            <Link href={houseHref('meals')}>All meals</Link>
          </div>
          {data.nextMeal ? (
            <>
              <h3>{data.nextMeal.question}</h3>
              <p className="design-muted">
                <strong>{data.nextMeal.joiningCount} people</strong> are joining
                · {data.nextMeal.awaitingCount} awaiting a response
              </p>
              <div className="design-meal-details">
                <span>
                  <small>WHEN</small>
                  <strong>{time(data.nextMeal.startsAt)}</strong>
                </span>
                <span>
                  <small>RESPOND BY</small>
                  <strong>{time(data.nextMeal.responseDeadline)}</strong>
                </span>
              </div>
              <Link
                className="primary-button"
                href={houseHref('meals', 'meal', data.nextMeal.id)}
              >
                Respond / view details{' '}
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <p className="design-empty">
                No meal plans yet. Plan something together.
              </p>
              <Link className="inline-link" href={houseHref('meals')}>
                Explore meals <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </>
          )}
        </section>
        <section className="design-panel" aria-labelledby="shopping-heading">
          <div className="design-section-heading">
            <h2 id="shopping-heading">
              <span className="design-item-icon lilac">
                <ShoppingBasket size={18} aria-hidden="true" />
              </span>
              Shopping
            </h2>
            <Link href={houseHref('shopping')}>View list</Link>
          </div>
          <p className="design-large-count">
            {data.shoppingOpenCount}
            <span> items needed</span>
          </p>
          <p className="design-muted">
            {data.shoppingOpenCount
              ? 'Your shared list is ready for the next shop.'
              : 'The shared shopping list is all clear.'}
          </p>
          <Link
            className="design-record-row design-shortcut"
            href={houseHref('shopping')}
          >
            <span className="design-row-copy">
              <strong>Open shared shopping list</strong>
              <small>Add items, check quantities, and record purchases.</small>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <section className="design-panel" aria-labelledby="chores-heading">
          <div className="design-section-heading">
            <h2 id="chores-heading">
              <span className="design-item-icon blue">
                <ClipboardCheck size={18} aria-hidden="true" />
              </span>
              Chores
            </h2>
            <Link href={houseHref('chores')}>View chores</Link>
          </div>
          <p className="design-large-count">
            {data.chores.openCount}
            <span> open chores</span>
          </p>
          <p className="design-muted">
            {data.chores.overdueCount} overdue across the household.
          </p>
          <Link
            className="design-record-row design-shortcut"
            href={houseHref('chores')}
          >
            <span className="design-row-copy">
              <strong>Keep the house running</strong>
              <small>Review assignments and update completed chores.</small>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <section className="design-assistant-callout">
          <span className="design-item-icon green">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <h2>A little help around the house.</h2>
          <p>Ask about balances, plans, and what needs your attention.</p>
          <Link
            href={href(
              `/assistant?household=${encodeURIComponent(household.id)}`,
            )}
          >
            Ask HouseMate <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>

      <section aria-labelledby="activity-heading">
        <div className="design-section-heading">
          <h2 id="activity-heading">Recent activity</h2>
          {data.recentActivity.length > 3 && (
            <button type="button" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'View all'}
            </button>
          )}
        </div>
        <div className="design-panel design-activity">
          {data.recentActivity.length ? (
            data.recentActivity
              .slice(0, expanded ? undefined : 3)
              .map((event) => (
                <Link
                  className="design-record-row"
                  key={event.id}
                  href={href(activityHref(household.id, event))}
                >
                  <span className="design-item-icon green">
                    {event.resourceType === 'settlement' ? (
                      <WalletCards size={18} aria-hidden="true" />
                    ) : (
                      <ReceiptText size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span className="design-row-copy">
                    <strong>{event.title}</strong>
                    <small>{activityLabel(event)}</small>
                  </span>
                  <time dateTime={event.occurredAt}>
                    {time(event.occurredAt)}
                  </time>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ))
          ) : (
            <p className="design-empty">
              No financial activity yet. Add your first expense or bill.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
