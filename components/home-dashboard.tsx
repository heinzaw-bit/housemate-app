'use client';

import { useEffect, useRef, useState } from 'react';
import { WorkspaceLoading } from '@/components/workspace-loading';
import {
  ApiRequestError,
  type Dashboard,
  getDashboard,
  type Household,
} from '@/lib/api';
import { subscribeToBillUpdates } from '@/lib/bill-updates';
import { dashboardStaleAfterMs } from '@/lib/dashboard';
import { householdReadPath, recentRead } from '@/lib/recent-reads';
import { HouseholdOverview } from './household-overview';

export function HomeDashboard({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const readPath = householdReadPath(household.id, 'dashboard');
  const [data, setData] = useState<Dashboard | null>(
    () => recentRead<Dashboard>(token, readPath)?.value ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const refreshedAt = useRef(0);

  useEffect(() => {
    let active = true;
    let pending = false;
    let refreshAfterCurrent = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || !active) return;
      pending = true;
      setLoading(true);
      setError('');
      try {
        const next = await getDashboard(token, household.id, controller.signal);
        if (!active || refreshAfterCurrent) return;
        setData(next);
        refreshedAt.current = Date.now();
        setStale(false);
      } catch (failure) {
        if (!active || refreshAfterCurrent) return;
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
        if (active && refreshAfterCurrent) {
          refreshAfterCurrent = false;
          void refresh();
        } else if (active) {
          setLoading(false);
        }
      }
    }
    function resume() {
      if (document.visibilityState === 'visible') void refresh();
    }
    function offline() {
      setStale(true);
    }
    const unsubscribe = subscribeToBillUpdates(household.id, () => {
      if (!navigator.onLine) return;
      if (pending) refreshAfterCurrent = true;
      else void refresh();
    });
    const timer = window.setInterval(() => {
      if (Date.now() - refreshedAt.current >= dashboardStaleAfterMs) {
        setStale(true);
      }
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refresh();
    }, 15_000);
    void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      controller.abort();
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [token, household.id]);

  return (
    <div className="space-y-5">
      {!data && (
        <p className="design-read-status" role="status">
          {loading
            ? `Loading ${household.name} overview…`
            : 'Dashboard unavailable.'}
        </p>
      )}
      {data && stale && !error && (
        <p className="design-read-status" role="status">
          Dashboard totals may be out of date.
        </p>
      )}
      {error && (
        <p role="alert" className="form-message error">
          {error}{' '}
          {data
            ? 'Showing the last successful update; totals may have changed.'
            : 'The dashboard will refresh automatically when connected.'}
        </p>
      )}
      {loading && !data && <WorkspaceLoading kind="home" />}
      {data && <HouseholdOverview data={data} household={household} />}
    </div>
  );
}
