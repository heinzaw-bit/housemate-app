'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ApiRequestError,
  disablePushDevice,
  getNotificationPreferences,
  getNotifications,
  getPushConfig,
  getPushDevices,
  type Household,
  type NotificationItem,
  type NotificationPreferences,
  notificationCategories,
  type PushConfig,
  type PushDevice,
  readAllNotifications,
  readNotification,
  saveNotificationPreferences,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { appendRecords } from '@/lib/record-pages';
import {
  disableBrowserPush,
  enableBrowserPush,
  localPushDevice,
  supportsWebPush,
} from '@/lib/web-push';

export function NotificationWorkspace({
  token,
  household,
  accountId,
}: {
  token: string;
  household: Household;
  accountId: string;
}) {
  const [view, setView] = useState<'inbox' | 'settings'>('inbox');
  const [scope, setScope] = useState<'all' | 'unread'>('all');
  const [records, setRecords] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [reading, setReading] = useState('');
  const pages = useRef(1);
  const version = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(
    async (background = false) => {
      const request = ++version.current;
      if (!background) setLoading(true);
      try {
        let next = await getNotifications(token, household.id, scope);
        let items = next.notifications;
        const count = next.unreadCount;
        for (let page = 1; page < pages.current && next.nextCursor; page++) {
          next = await getNotifications(
            token,
            household.id,
            scope,
            next.nextCursor,
          );
          items = [...items, ...next.notifications];
        }
        if (request !== version.current) return;
        setRecords([...new Map(items.map((item) => [item.id, item])).values()]);
        setUnread(count);
        setCursor(next.nextCursor);
        setError('');
        setUpdatedAt(new Date().toISOString());
      } catch (failure) {
        if (request !== version.current) return;
        if (
          failure instanceof ApiRequestError &&
          [401, 403, 404].includes(failure.status)
        ) {
          setRecords([]);
          setUnread(0);
          setCursor(null);
        }
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load your inbox.',
        );
      } finally {
        if (request === version.current) setLoading(false);
      }
    },
    [token, household.id, scope],
  );
  useEffect(() => {
    pages.current = 1;
    void refresh();
    const onReturn = () => {
      if (document.visibilityState === 'visible' && navigator.onLine)
        void refresh(true);
    };
    const timer = setInterval(onReturn, 30_000);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      version.current++;
      clearInterval(timer);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('settings') === '1')
      setView('settings');
  }, []);
  async function more() {
    if (!cursor || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    const request = ++version.current;
    try {
      const next = await getNotifications(token, household.id, scope, cursor);
      if (request !== version.current) return;
      setRecords((old) => appendRecords(old, next.notifications));
      setCursor(next.nextCursor);
      setUnread(next.unreadCount);
      pages.current++;
      setError('');
    } catch (failure) {
      if (request === version.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load older notifications.',
        );
    } finally {
      busy.current = false;
      setLoadingMore(false);
      setLoading(false);
    }
  }
  async function mark(id: string, all = false) {
    if (reading) return;
    setReading(id);
    setError('');
    try {
      if (all) await readAllNotifications(token, household.id, id);
      else await readNotification(token, household.id, id);
      window.dispatchEvent(new Event('housemate.notifications.changed'));
      await refresh(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not mark notifications read.',
      );
    } finally {
      setReading('');
    }
  }
  return (
    <div className="content-inner space-y-5 pt-5">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">STAY IN THE LOOP</span>
          <h1>Notifications</h1>
          <p>Your updates and reminders for {household.name}.</p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh inbox
        </Button>
      </div>
      <nav aria-label="Notification sections" className="flex gap-2">
        <Button
          variant={view === 'inbox' ? 'default' : 'outline'}
          aria-pressed={view === 'inbox'}
          onClick={() => setView('inbox')}
        >
          Inbox{unread ? ` (${unread})` : ''}
        </Button>
        <Button
          variant={view === 'settings' ? 'default' : 'outline'}
          aria-pressed={view === 'settings'}
          onClick={() => setView('settings')}
        >
          Settings
        </Button>
      </nav>
      {view === 'settings' ? (
        <NotificationSettings
          token={token}
          household={household}
          accountId={accountId}
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Your inbox</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={!!reading || !unread || !records.length}
                onClick={() => void mark(records[0].id, true)}
              >
                {reading ? 'Saving…' : 'Mark all read'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={scope === 'all' ? 'default' : 'outline'}
                aria-pressed={scope === 'all'}
                onClick={() => setScope('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={scope === 'unread' ? 'default' : 'outline'}
                aria-pressed={scope === 'unread'}
                onClick={() => setScope('unread')}
              >
                Unread
              </Button>
            </div>
            {updatedAt && (
              <p className="text-xs text-muted-foreground">
                Updated {new Date(updatedAt).toLocaleTimeString()} · Refreshes
                while visible.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-xl bg-destructive/10 p-3 text-destructive"
              >
                {error}
                {updatedAt ? ' The last view may be out of date.' : ''}
              </p>
            )}
            {loading && <p role="status">Loading notifications…</p>}
            {!loading && !error && !records.length && (
              <p className="py-8 text-center text-muted-foreground">
                {scope === 'unread'
                  ? 'You’re caught up.'
                  : 'No notifications yet. New household activity and due reminders will appear here.'}
              </p>
            )}
            <ul className="space-y-3">
              {records.map((item) => (
                <li
                  key={item.id}
                  className={`history-row rounded-xl border p-4 ${item.readAt ? 'border-border' : 'border-primary/40 bg-primary/5'}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">
                      {item.category} · {item.priority}
                    </span>
                    {!item.readAt && (
                      <strong className="text-primary">Unread</strong>
                    )}
                    <time dateTime={item.createdAt}>
                      {new Intl.DateTimeFormat('en', {
                        timeZone: household.timezone,
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.createdAt))}
                    </time>
                  </div>
                  <h3 className="mt-1 font-semibold">{item.title}</h3>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {item.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={item.href}
                      onClick={() => {
                        if (!item.readAt) void mark(item.id);
                      }}
                      className="text-sm font-medium text-primary underline underline-offset-4"
                    >
                      Open related item
                    </Link>
                    {!item.readAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!reading}
                        onClick={() => void mark(item.id)}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {cursor && (
              <Button
                className="mt-4"
                variant="outline"
                disabled={loadingMore || loading}
                onClick={() => void more()}
              >
                {loadingMore ? 'Loading…' : 'Load older notifications'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NotificationSettings({
  token,
  household,
  accountId,
}: {
  token: string;
  household: Household;
  accountId: string;
}) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [localId, setLocalId] = useState('');
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('');
  const [error, setError] = useState('');
  const [pushError, setPushError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState('');
  useLeaveGuard(
    saving ||
      working ||
      (preferences !== null &&
        JSON.stringify(preferences) !== savedPreferences),
  );
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    const results = await Promise.allSettled([
      getNotificationPreferences(token, household.id),
      getPushConfig(token),
      getPushDevices(token),
    ]);
    if (id !== request.current) return;
    if (results[0].status === 'fulfilled') {
      setPreferences(results[0].value);
      setSavedPreferences(JSON.stringify(results[0].value));
      setError('');
    } else
      setError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : 'Could not load preferences.',
      );
    if (results[1].status === 'fulfilled') setConfig(results[1].value);
    if (results[2].status === 'fulfilled') setDevices(results[2].value);
    const failed = results
      .slice(1)
      .find((result) => result.status === 'rejected');
    setPushError(
      failed?.status === 'rejected'
        ? 'Could not check push setup or devices. Retry to refresh.'
        : '',
    );
    setLocalId(localPushDevice()?.id ?? '');
  }, [token, household.id]);
  useEffect(() => {
    setSupported(supportsWebPush());
    setPermission(
      'Notification' in window ? Notification.permission : 'unsupported',
    );
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!preferences) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await saveNotificationPreferences(token, household.id, {
        categories: preferences.categories,
        quietHours: preferences.quietHours,
      });
      setPreferences(next);
      setSavedPreferences(JSON.stringify(next));
      setNotice(
        'Notification preferences saved. Existing inbox history stays available.',
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save preferences.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function enable() {
    if (!config?.publicKey) return;
    setWorking(true);
    setPushError('');
    setNotice('');
    try {
      const device = await enableBrowserPush(
        token,
        accountId,
        config.publicKey,
      );
      setLocalId(device.id);
      setDevices(await getPushDevices(token));
      setPermission(Notification.permission);
      setNotice(
        'Web push enabled for this browser. You’ll receive future updates according to each household’s preferences.',
      );
    } catch (failure) {
      setPushError(
        failure instanceof Error
          ? failure.message
          : 'Could not enable browser push.',
      );
      if ('Notification' in window) setPermission(Notification.permission);
    } finally {
      setWorking(false);
    }
  }
  async function disable(id: string) {
    setWorking(true);
    setPushError('');
    try {
      if (id === localId) {
        await disableBrowserPush(token);
        setLocalId('');
      } else await disablePushDevice(token, id);
      setDevices(await getPushDevices(token));
      setNotice('Push disabled for that device. Your inbox still works.');
    } catch (failure) {
      setPushError(
        failure instanceof Error
          ? failure.message
          : 'Could not disable device.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="rounded-xl bg-primary/10 p-3 text-primary">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Updates for this household</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which new updates enter your inbox and which may reach
            enabled push devices. Shopping push is off by default.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-3 text-destructive">
              {error}
            </p>
          )}
          {!preferences ? (
            <Button variant="outline" onClick={() => void load()}>
              Retry settings
            </Button>
          ) : (
            <form onSubmit={(event) => void save(event)} className="space-y-5">
              <fieldset disabled={saving}>
                <legend className="sr-only">Notification categories</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_65px_65px] gap-2 border-b pb-2 text-sm font-medium">
                  <span>Category</span>
                  <span>In app</span>
                  <span>Push</span>
                </div>
                {notificationCategories.map((category) => (
                  <div
                    key={category}
                    className="grid grid-cols-[minmax(0,1fr)_65px_65px] items-center gap-2 border-b py-3 text-sm"
                  >
                    <span className="capitalize">
                      {category === 'money' ? 'Expenses' : category}
                    </span>
                    {(['inApp', 'webPush'] as const).map((channel) => (
                      <input
                        key={channel}
                        type="checkbox"
                        aria-label={`${category} ${channel === 'inApp' ? 'in-app' : 'web push'} notifications`}
                        checked={preferences.categories[category][channel]}
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            categories: {
                              ...preferences.categories,
                              [category]: {
                                ...preferences.categories[category],
                                [channel]: event.target.checked,
                              },
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </fieldset>
              <fieldset disabled={saving} className="space-y-3">
                <legend className="font-medium">
                  Quiet hours ({preferences.timezone})
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.quietHours.enabled}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        quietHours: {
                          ...preferences.quietHours,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  Delay push during quiet hours
                </label>
                <div className="grid max-w-sm grid-cols-2 gap-3">
                  <label htmlFor="quiet-start" className="space-y-1 text-sm">
                    Start
                    <Input
                      id="quiet-start"
                      type="time"
                      required
                      value={preferences.quietHours.start}
                      onChange={(event) =>
                        setPreferences({
                          ...preferences,
                          quietHours: {
                            ...preferences.quietHours,
                            start: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label htmlFor="quiet-end" className="space-y-1 text-sm">
                    End
                    <Input
                      id="quiet-end"
                      type="time"
                      required
                      value={preferences.quietHours.end}
                      onChange={(event) =>
                        setPreferences({
                          ...preferences,
                          quietHours: {
                            ...preferences.quietHours,
                            end: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  All priorities respect quiet hours. Relevant unread updates
                  wait until quiet hours end; expired or already resolved
                  reminders are skipped. The inbox stays available.
                </p>
              </fieldset>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save preferences'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Web push</CardTitle>
          <p className="text-sm text-muted-foreground">
            Get notified when bills are due, meals need your reply, or chores
            are assigned—even while HouseMate is closed. Push messages contain a
            generic update and a link, without amounts, household names, or
            private message text.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {pushError && (
            <p role="alert" className="text-destructive">
              {pushError}
            </p>
          )}
          {!supported && (
            <p className="text-sm text-muted-foreground">
              This browser cannot use push here. Use a supported browser on
              HTTPS or localhost; some phones require installing the app first.
            </p>
          )}
          {permission === 'denied' && (
            <p className="text-sm text-muted-foreground">
              Notifications are blocked. You can allow them in your browser’s
              site settings. No permission request will open automatically.
            </p>
          )}
          {config && !config.enabled && (
            <p className="rounded-xl bg-muted p-3 text-sm">
              Web push needs server setup: a real public contact email or HTTPS
              support URL. Your in-app inbox and reminder feed are available
              now.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                working ||
                !supported ||
                !config?.enabled ||
                permission === 'denied'
              }
              onClick={() => void enable()}
            >
              Enable push in this browser
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void load()}
            >
              Refresh settings and devices
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Devices are attached to your account across households. Category
            choices and quiet hours apply separately to each household. Signing
            out removes this browser’s subscription.
          </p>
          <ul className="space-y-2">
            {devices.map((device, index) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <div>
                  <strong>
                    {device.id === localId
                      ? 'This browser'
                      : `Device ${index + 1}`}
                  </strong>
                  <p className="text-muted-foreground">
                    {device.enabled ? 'Enabled' : 'Disabled'} · Added{' '}
                    {new Date(device.createdAt).toLocaleDateString()}
                    {device.lastError
                      ? ' · Delivery failed; enable again if the subscription expired.'
                      : ''}
                  </p>
                </div>
                {device.enabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() => void disable(device.id)}
                  >
                    Disable
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
