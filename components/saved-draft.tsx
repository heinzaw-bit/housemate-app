'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import {
  draftChangeEvent,
  draftGeneration,
  draftKey,
  draftLifetime,
  pruneSavedDrafts,
  type SavedDraft,
  safeDraftValue,
  sameDraftShape,
  validFormCollections,
} from '@/lib/saved-drafts';

const DraftScope = createContext<{
  account: string;
  household: string;
  context: string;
} | null>(null);
export function SavedDraftProvider({
  account,
  household,
  households,
  context,
  children,
}: {
  account: string;
  household: string;
  households: string[];
  context: string;
  children: ReactNode;
}) {
  const membership = households.join(',');
  useEffect(() => {
    pruneSavedDrafts(account, membership.split(','));
  }, [account, membership]);
  const scope = useMemo(
    () => ({ account, household, context }),
    [account, household, context],
  );
  return (
    <DraftScope.Provider
      key={`${account}:${household}:${context}`}
      value={scope}
    >
      {children}
    </DraftScope.Provider>
  );
}

export function useSavedDraft<T extends Record<string, unknown>>({
  kind,
  enabled,
  value,
  restore,
  validate,
  seed,
  autoResume = false,
  relatedKinds = [],
}: {
  kind: string;
  enabled: boolean;
  value: T;
  restore: (value: T) => void;
  validate?: (value: T) => boolean;
  seed?: () => T;
  autoResume?: boolean;
  relatedKinds?: string[];
}) {
  const scope = useContext(DraftScope);
  const key = scope?.account
    ? draftKey(scope.account, scope.household, kind)
    : '';
  const [pending, setPending] = useState<SavedDraft<T> | null>(null);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const current = useRef({ enabled, value, restore, validate, seed });
  current.current = { enabled, value, restore, validate, seed };
  const expected = useRef<string | null>(null);
  const attempt = useRef<SavedDraft['attempt']>(null);
  const epoch = useRef(draftGeneration());
  const suspended = useRef(false);
  const cleared = useRef(false);
  const clearedSignature = useRef('');
  const confirmedValue = useRef<T | null>(null);
  const conflicted = useRef(false);
  const skip = useRef(false);
  const pendingRef = useRef(false);
  const firstAttempt = useRef(false);
  const context = scope?.context;

  useEffect(() => {
    if (!key || !scope) return;
    epoch.current = draftGeneration();
    try {
      const raw = localStorage.getItem(key);
      expected.current = raw;
      if (raw) {
        let saved: SavedDraft<T> | null = null;
        try {
          saved = JSON.parse(raw);
        } catch {
          /* Invalid local data is discarded. */
        }
        if (
          !saved ||
          raw.length > 150000 ||
          saved.version !== 1 ||
          saved.accountId !== scope.account ||
          saved.householdId !== scope.household ||
          saved.kind !== kind ||
          saved.context !== context ||
          !Number.isFinite(saved.savedAt) ||
          saved.savedAt > Date.now() + 60000 ||
          Date.now() - saved.savedAt > draftLifetime ||
          !safeDraftValue(saved.value) ||
          !sameDraftShape(current.current.value, saved.value) ||
          !validFormCollections(saved.value) ||
          (current.current.validate &&
            !current.current.validate(saved.value)) ||
          (saved.attempt !== null &&
            (!saved.attempt ||
              typeof saved.attempt.signature !== 'string' ||
              saved.attempt.signature.length > 150000 ||
              !/^[a-f0-9-]{36}$/.test(saved.attempt.key)))
        ) {
          localStorage.removeItem(key);
          expected.current = null;
        } else if (autoResume) {
          attempt.current = saved.attempt;
          confirmedValue.current = saved.attempt ? saved.value : null;
          skip.current = true;
          current.current.restore(saved.value);
          setStatus('Draft restored. Review before confirming.');
        } else {
          pendingRef.current = true;
          setPending(saved);
        }
      }
    } catch {
      setStatus('Draft recovery is unavailable in this browser.');
      suspended.current = true;
    }
    setReady(true);
    const revoke = () => {
      suspended.current = true;
      pendingRef.current = false;
      setPending(null);
      setStatus('');
    };
    window.addEventListener(draftChangeEvent, revoke);
    return () => window.removeEventListener(draftChangeEvent, revoke);
  }, [key, context, kind, autoResume, scope]);

  function persist(next = current.current.value) {
    if (
      !key ||
      !scope ||
      suspended.current ||
      cleared.current ||
      pendingRef.current ||
      epoch.current !== draftGeneration()
    )
      return;
    try {
      const latest = localStorage.getItem(key);
      if (latest !== expected.current) {
        conflicted.current = true;
        suspended.current = true;
        setStatus(
          'Another tab changed this saved draft. Your current edits remain in this tab; reload to recover the latest saved version.',
        );
        return;
      }
      if (!safeDraftValue(next)) throw Error('Invalid draft');
      const raw = JSON.stringify({
        version: 1,
        accountId: scope.account,
        householdId: scope.household,
        context: scope.context,
        kind,
        savedAt: Date.now(),
        value: confirmedValue.current ?? next,
        attempt: attempt.current,
      });
      if (raw.length > 150000) throw Error('Draft too large');
      localStorage.setItem(key, raw);
      expected.current = raw;
      setStatus('Draft saved on this device · kept for 7 days');
    } catch {
      setStatus(
        'Could not save this draft on this device. Keep this tab open.',
      );
    }
  }
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const signature = JSON.stringify(value);
  useEffect(() => {
    if (!enabled || signature !== clearedSignature.current)
      cleared.current = false;
    if (!ready || !enabled || skip.current) {
      skip.current = false;
      return;
    }
    persistRef.current();
  }, [ready, enabled, signature]);
  useEffect(() => {
    const flush = () => {
      if (current.current.enabled) persistRef.current();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  function clear() {
    cleared.current = true;
    clearedSignature.current = JSON.stringify(current.current.value);
    confirmedValue.current = null;
    attempt.current = null;
    pendingRef.current = false;
    setPending(null);
    skip.current = true;
    try {
      if (key && localStorage.getItem(key) === expected.current) {
        localStorage.removeItem(key);
        if (scope)
          for (const related of relatedKinds)
            localStorage.removeItem(
              draftKey(scope.account, scope.household, related),
            );
      }
      expected.current = null;
    } catch {
      setStatus(
        'Could not remove the saved draft. Clear HouseMate site data on this device.',
      );
      return;
    }
    setStatus('');
  }
  return {
    hasAttempt: !!attempt.current,
    pending,
    status,
    clear,
    resume() {
      if (!pending || suspended.current) return;
      attempt.current = pending.attempt;
      confirmedValue.current = pending.attempt ? pending.value : null;
      pendingRef.current = false;
      skip.current = true;
      current.current.restore(pending.value);
      setPending(null);
      setStatus(
        pending.attempt
          ? 'Recovered draft: its earlier confirmation may have been saved. Review and retry unchanged, or check the record before discarding.'
          : 'Draft restored. Review the details before confirming.',
      );
    },
    confirmationKey(payload: unknown, fallback?: string) {
      if (key && (epoch.current !== draftGeneration() || conflicted.current))
        throw Error(
          'The saved draft or account changed. Reload and review before confirming.',
        );
      if (pendingRef.current)
        throw Error(
          'Resume or discard the saved draft before confirming a new one.',
        );
      const signature = JSON.stringify(payload);
      if (attempt.current && attempt.current.signature !== signature)
        throw Error(
          'An earlier confirmation may have been saved. Retry the original draft unchanged, or check the household record before discarding this draft.',
        );
      const result = attempt.current?.key ?? fallback ?? crypto.randomUUID();
      firstAttempt.current = !attempt.current;
      if (!attempt.current)
        confirmedValue.current =
          current.current.seed?.() ?? current.current.value;
      attempt.current = { signature, key: result };
      persist(current.current.seed?.() ?? current.current.value);
      if (conflicted.current)
        throw Error(
          'Another tab changed this draft. Reload and review before confirming.',
        );
      return result;
    },
    reject(cause: unknown) {
      if (
        firstAttempt.current &&
        cause instanceof ApiRequestError &&
        ((cause.status >= 400 && cause.status < 500 && cause.status !== 409) ||
          cause.code === 'OFFLINE')
      ) {
        attempt.current = null;
        confirmedValue.current = null;
        persist();
      }
    },
    saveNow() {
      persist(current.current.seed?.() ?? current.current.value);
    },
  };
}

export function SavedDraftNotice({
  draft,
  disabled = false,
  resumeDisabled = false,
}: {
  draft: Pick<
    ReturnType<typeof useSavedDraft>,
    'pending' | 'status' | 'resume' | 'clear'
  >;
  disabled?: boolean;
  resumeDisabled?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const hadPending = useRef(false);
  useEffect(() => {
    if (hadPending.current && !draft.pending)
      container.current?.focus({ preventScroll: true });
    hadPending.current = !!draft.pending;
  }, [draft.pending]);
  if (draft.pending)
    return (
      <section
        ref={container}
        tabIndex={-1}
        aria-label="Saved draft"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/10 p-3 text-sm"
      >
        <p>
          Unfinished draft saved on this device.{' '}
          {draft.pending.attempt &&
            'An earlier confirmation may already have been saved.'}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={disabled || resumeDisabled}
            onClick={draft.resume}
          >
            Resume draft
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            variant="ghost"
            disabled={disabled}
            onClick={draft.clear}
          >
            Discard saved draft
          </Button>
        </div>
      </section>
    );
  return draft.status ? (
    <section ref={container} tabIndex={-1} aria-label="Draft status">
      <p className="text-sm text-muted-foreground" role="status">
        {draft.status}
      </p>
    </section>
  ) : null;
}
