'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from './api';
import { householdReadPath, recentRead } from './recent-reads';

export function useHouseRecords<T extends { id: string }, S extends string>({
  token,
  householdId,
  scope,
  cacheResource,
  loadPage,
  getRecord,
  focusedId,
  focusSignal,
  pauseRefresh = false,
}: {
  token: string;
  householdId: string;
  scope: S;
  cacheResource?: 'announcements';
  loadPage: (
    token: string,
    householdId: string,
    scope: S,
    limit: number,
    offset: number,
  ) => Promise<T[]>;
  getRecord: (token: string, householdId: string, id: string) => Promise<T>;
  focusedId: string;
  focusSignal: number;
  pauseRefresh?: boolean;
}) {
  const readPath = cacheResource
    ? householdReadPath(
        householdId,
        `${cacheResource}?scope=${scope}&limit=50&offset=0`,
      )
    : '';
  const [records, setRecords] = useState<T[]>(
    () =>
      recentRead<Record<string, T[]>>(token, readPath)?.value[
        cacheResource ?? ''
      ] ?? [],
  );
  const [selected, setSelected] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(() => {
    const read = recentRead(token, readPath);
    return read ? new Date(read.readAt).toISOString() : '';
  });
  const selectedRef = useRef<T | null>(null);
  const pageRequest = useRef(0);
  const detailRequest = useRef(0);
  const offset = useRef(0);
  const moreBusy = useRef(false);
  const loadedPages = useRef(1);

  const accept = useCallback((record: T, mutation = true) => {
    if (mutation) {
      pageRequest.current += 1;
      detailRequest.current += 1;
      setLoading(false);
      setDetailLoading(false);
    }
    selectedRef.current = record;
    setSelected(record);
    setRecords((old) =>
      old.map((item) => (item.id === record.id ? record : item)),
    );
    setError('');
  }, []);
  const close = useCallback(() => {
    detailRequest.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setDetailLoading(false);
  }, []);
  const refresh = useCallback(
    async (background = false) => {
      const request = ++pageRequest.current;
      const selectedId = selectedRef.current?.id;
      const detailVersion = detailRequest.current;
      if (!background) setLoading(true);
      try {
        const [pages, detail] = await Promise.all([
          Promise.all(
            Array.from({ length: loadedPages.current }, (_, page) =>
              loadPage(token, householdId, scope, 50, page * 50),
            ),
          ),
          selectedId
            ? getRecord(token, householdId, selectedId)
            : Promise.resolve(null),
        ]);
        if (request !== pageRequest.current) return;
        const next = pages.flat();
        setRecords([
          ...new Map(next.map((record) => [record.id, record])).values(),
        ]);
        offset.current = next.length;
        setHasMore(pages.at(-1)?.length === 50);
        if (
          detail &&
          detailVersion === detailRequest.current &&
          selectedRef.current?.id === detail.id
        ) {
          selectedRef.current = detail;
          setSelected(detail);
        }
        setUpdatedAt(new Date().toISOString());
        setError('');
      } catch (failure) {
        if (request !== pageRequest.current) return;
        if (
          failure instanceof ApiRequestError &&
          [401, 403, 404].includes(failure.status)
        ) {
          setRecords([]);
          close();
        }
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not refresh household records.',
        );
      } finally {
        if (request === pageRequest.current) setLoading(false);
      }
    },
    [token, householdId, scope, loadPage, getRecord, close],
  );

  const open = useCallback(
    async (id: string) => {
      const request = ++detailRequest.current;
      setDetailLoading(true);
      setError('');
      try {
        const record = await getRecord(token, householdId, id);
        if (request === detailRequest.current) accept(record, false);
      } catch (failure) {
        if (request === detailRequest.current) {
          close();
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not open this record.',
          );
        }
      } finally {
        if (request === detailRequest.current) setDetailLoading(false);
      }
    },
    [token, householdId, getRecord, accept, close],
  );

  useEffect(() => {
    loadedPages.current = 1;
    const snapshot = recentRead<Record<string, T[]>>(token, readPath);
    setRecords(snapshot?.value[cacheResource ?? ''] ?? []);
    setUpdatedAt(snapshot ? new Date(snapshot.readAt).toISOString() : '');
    close();
    void refresh();
    return () => {
      pageRequest.current += 1;
    };
  }, [refresh, readPath, cacheResource, token, close]);

  useEffect(() => {
    if (pauseRefresh) return;
    const onReturn = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refresh(true);
    };
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    const timer = window.setInterval(onReturn, 15_000);
    return () => {
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
      window.clearInterval(timer);
    };
  }, [pauseRefresh, refresh]);
  useEffect(() => {
    if (focusedId && focusSignal) void open(focusedId);
    return () => {
      detailRequest.current += 1;
    };
  }, [focusedId, focusSignal, open]);

  async function loadMore() {
    if (moreBusy.current) return;
    moreBusy.current = true;
    const request = pageRequest.current;
    setLoadingMore(true);
    try {
      const next = await loadPage(
        token,
        householdId,
        scope,
        50,
        offset.current,
      );
      if (request !== pageRequest.current) return;
      setRecords((old) => [
        ...old,
        ...next.filter((item) => !old.some((record) => record.id === item.id)),
      ]);
      offset.current += next.length;
      loadedPages.current += 1;
      setHasMore(next.length === 50);
      setError('');
    } catch (failure) {
      if (request === pageRequest.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load more records.',
        );
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }
  return {
    records,
    selected,
    loading,
    detailLoading,
    loadingMore,
    hasMore,
    error,
    updatedAt,
    setError,
    open,
    close,
    accept,
    refresh,
    loadMore,
  };
}
