'use client';
import { Bell, ChevronDown, Moon, RefreshCw, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { NotificationInbox } from './notification-inbox';

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
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'settings')
      setView('settings');
  }, []);
  const [settingsPending, setSettingsPending] = useState<'busy' | 'dirty' | ''>(
    '',
  );
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
  function changeView(next: 'inbox' | 'settings') {
    if (view === next) return;
    if (view === 'settings' && settingsPending === 'busy') return;
    if (
      view === 'settings' &&
      settingsPending === 'dirty' &&
      !window.confirm(
        'Leave notification settings and discard any unsaved changes?',
      )
    )
      return;
    setView(next);
  }
  return (
    <div className="content-inner notification-workspace">
      <div className="notification-page-heading">
        <div>
          <h1>
            Notifications{' '}
            {unread > 0 && (
              <span className="notification-count">
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </h1>
          <p>Updates for {household.name}.</p>
        </div>
        {view === 'inbox' && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh inbox"
            title="Refresh inbox"
            disabled={loading || loadingMore}
            onClick={() => void refresh()}
          >
            <RefreshCw size={19} aria-hidden="true" />
          </Button>
        )}
      </div>
      <nav aria-label="Notification sections" className="notification-tabs">
        <Button
          variant="ghost"
          aria-pressed={view === 'inbox'}
          disabled={settingsPending === 'busy'}
          onClick={() => changeView('inbox')}
        >
          Inbox
        </Button>
        <Button
          variant="ghost"
          aria-pressed={view === 'settings'}
          onClick={() => changeView('settings')}
        >
          Settings
        </Button>
      </nav>
      {view === 'settings' ? (
        <NotificationSettings
          token={token}
          household={household}
          accountId={accountId}
          onPendingChange={setSettingsPending}
        />
      ) : (
        <NotificationInbox
          household={household}
          records={records}
          unread={unread}
          scope={scope}
          setScope={setScope}
          loading={loading}
          loadingMore={loadingMore}
          reading={reading}
          error={error}
          updatedAt={updatedAt}
          cursor={cursor}
          mark={mark}
          more={more}
        />
      )}
    </div>
  );
}

function NotificationSettings({
  token,
  household,
  accountId,
  onPendingChange,
}: {
  token: string;
  household: Household;
  accountId: string;
  onPendingChange: (pending: 'busy' | 'dirty' | '') => void;
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
  const dirty =
    preferences !== null && JSON.stringify(preferences) !== savedPreferences;
  useLeaveGuard(saving || working || dirty);
  useEffect(() => {
    onPendingChange(saving || working ? 'busy' : dirty ? 'dirty' : '');
    return () => onPendingChange('');
  }, [saving, working, dirty, onPendingChange]);
  const request = useRef(0);
  const load = useCallback(
    async (resetPreferences = true) => {
      const id = ++request.current;
      const results = await Promise.allSettled([
        getNotificationPreferences(token, household.id),
        getPushConfig(token),
        getPushDevices(token),
      ]);
      if (id !== request.current) return;
      if (results[0].status === 'fulfilled' && resetPreferences) {
        setPreferences(results[0].value);
        setSavedPreferences(JSON.stringify(results[0].value));
        setError('');
      } else if (results[0].status === 'rejected' && resetPreferences)
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
      const local = localPushDevice();
      setLocalId(local?.accountId === accountId ? local.id : '');
      setPermission(
        'Notification' in window ? Notification.permission : 'unsupported',
      );
    },
    [token, household.id, accountId],
  );
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
    if (!preferences || saving || !dirty) return;
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
      setNotice('Preferences saved.');
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
      setNotice('Notifications enabled for this device.');
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
      setNotice('Device notifications turned off. Your inbox still works.');
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
  const currentDevice = devices.find((device) => device.id === localId);
  const pushEnabled = !!currentDevice?.enabled && permission === 'granted';
  const pushKnown = config !== null && !pushError;
  const inboxCount = preferences
    ? notificationCategories.filter(
        (category) => preferences.categories[category].inApp,
      ).length
    : 0;
  const pushCount = preferences
    ? notificationCategories.filter(
        (category) => preferences.categories[category].webPush,
      ).length
    : 0;
  const pushStatus = !pushKnown
    ? pushError
      ? 'Device status unavailable'
      : 'Checking device'
    : !supported
      ? 'Installation may be needed'
      : permission === 'denied'
        ? 'Blocked in device settings'
        : !config.enabled
          ? 'Unavailable right now'
          : pushEnabled
            ? 'On for this device'
            : 'Off for this device';
  return (
    <form
      onSubmit={(event) => void save(event)}
      className="notification-settings"
    >
      {notice && (
        <p role="status" className="notification-notice">
          {notice}
        </p>
      )}
      <section
        className="notification-settings-section"
        aria-labelledby="device-notifications-title"
      >
        <div className="notification-settings-heading">
          <span className="notification-setting-icon">
            <Smartphone size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="device-notifications-title">Device notifications</h2>
            <p>Get household updates while HouseMate is closed.</p>
          </div>
        </div>
        <div className="notification-device-status">
          <span
            className={`notification-status-dot ${pushEnabled && pushKnown ? 'is-on' : ''}`}
            aria-hidden="true"
          />
          <span>{pushStatus}</span>
          {pushEnabled ? (
            <Button
              type="button"
              variant="outline"
              disabled={working || !pushKnown}
              onClick={() => void disable(localId)}
            >
              Turn off
            </Button>
          ) : (
            <Button
              type="button"
              disabled={
                working ||
                !pushKnown ||
                !supported ||
                !config?.enabled ||
                permission === 'denied'
              }
              onClick={() => void enable()}
            >
              {working ? 'Updating…' : 'Enable notifications'}
            </Button>
          )}
        </div>
        {pushError && (
          <p role="alert" className="notification-alert">
            {pushError}
          </p>
        )}
        {!supported && (
          <p className="notification-help">
            On iPhone, add HouseMate to your Home Screen in Safari, then open it
            from its icon. Other devices need a supported browser and a secure
            connection.
          </p>
        )}
        {permission === 'denied' && (
          <p className="notification-help">
            Allow HouseMate notifications in your browser or phone settings,
            then check this device again.
          </p>
        )}
        {config && !config.enabled && (
          <p className="notification-help">
            Device notifications are unavailable right now. Your inbox still
            works.
          </p>
        )}
        {currentDevice?.lastError && (
          <p className="notification-help">
            A recent delivery failed. If notifications stopped, turn them off
            and enable them again.
          </p>
        )}
        <details className="notification-disclosure">
          <summary>
            Manage devices <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="notification-disclosure-content">
            <p className="notification-help">
              Devices belong to your account across households. Signing out
              disconnects this device.
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={working}
              onClick={() => void load(false)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Check devices
            </Button>
            {!devices.length && (
              <p className="notification-help">
                No registered devices
                {pushError ? ' could be checked.' : ' yet.'}
              </p>
            )}
            <ul className="notification-devices">
              {devices.map((device, index) => (
                <li key={device.id}>
                  <div>
                    <strong>
                      {device.id === localId
                        ? 'This device'
                        : `Device ${index + 1}`}
                    </strong>
                    <p>
                      {device.enabled ? 'On' : 'Off'} · Added{' '}
                      {new Date(device.createdAt).toLocaleDateString()}
                      {device.lastError ? ' · Delivery issue' : ''}
                    </p>
                  </div>
                  {device.enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={working}
                      onClick={() => void disable(device.id)}
                    >
                      Turn off
                      <span className="sr-only">
                        {' '}
                        {device.id === localId
                          ? 'this device'
                          : `Device ${index + 1}`}
                      </span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="notification-help">
              Push messages use generic text to keep household details private.
            </p>
          </div>
        </details>
      </section>
      <section
        className="notification-settings-section"
        aria-labelledby="choose-updates-title"
      >
        <div className="notification-settings-heading">
          <span className="notification-setting-icon">
            <Bell size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="choose-updates-title">Choose updates</h2>
            <p>
              For {household.name}. Other households have their own preferences.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="notification-alert">
            {error}
          </p>
        )}
        {!preferences ? (
          <div className="notification-preferences-loading">
            <p role="status">
              {error ? 'Settings could not be loaded.' : 'Loading preferences…'}
            </p>
            {error && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
              >
                Retry settings
              </Button>
            )}
          </div>
        ) : (
          <details className="notification-disclosure">
            <summary>
              <span>
                {inboxCount} inbox · {pushCount} push categories
              </span>
              <span className="notification-disclosure-label">
                Edit <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <fieldset
              disabled={saving}
              className="notification-disclosure-content"
            >
              <legend className="sr-only">
                Notification categories for {household.name}
              </legend>
              <div className="notification-category-heading">
                <span>Update</span>
                <span>Inbox</span>
                <span>Push</span>
              </div>
              {notificationCategories.map((category) => (
                <div key={category} className="notification-category-row">
                  <span>{category === 'money' ? 'Expenses' : category}</span>
                  {(['inApp', 'webPush'] as const).map((channel) => (
                    <NotificationSwitch
                      key={channel}
                      label={`${category === 'money' ? 'Expenses' : category} ${channel === 'inApp' ? 'inbox' : 'push'} notifications`}
                      checked={preferences.categories[category][channel]}
                      onChange={(checked) =>
                        setPreferences({
                          ...preferences,
                          categories: {
                            ...preferences.categories,
                            [category]: {
                              ...preferences.categories[category],
                              [channel]: checked,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </div>
              ))}
              <p className="notification-help">
                Inbox keeps updates here. Push sends them to enabled devices.
                Existing inbox history stays available.
              </p>
            </fieldset>
          </details>
        )}
      </section>
      <section
        className="notification-settings-section"
        aria-labelledby="quiet-hours-title"
      >
        <div className="notification-settings-heading">
          <span className="notification-setting-icon">
            <Moon size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="quiet-hours-title">Quiet hours</h2>
            <p>
              {preferences?.quietHours.enabled
                ? `Push pauses from ${preferences.quietHours.start} to ${preferences.quietHours.end}.`
                : 'Choose when device notifications should pause.'}
            </p>
          </div>
          {preferences && (
            <NotificationSwitch
              label="Enable quiet hours"
              disabled={saving}
              checked={preferences.quietHours.enabled}
              onChange={(checked) =>
                setPreferences({
                  ...preferences,
                  quietHours: { ...preferences.quietHours, enabled: checked },
                })
              }
            />
          )}
        </div>
        {preferences?.quietHours.enabled && (
          <fieldset disabled={saving} className="notification-quiet-times">
            <legend className="sr-only">Quiet hour times</legend>
            <label htmlFor="quiet-start">
              From
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
            <label htmlFor="quiet-end">
              Until
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
            <p className="notification-help">
              {preferences.timezone} · All priorities pause. Your inbox stays
              available; eligible updates resume after quiet hours.
            </p>
          </fieldset>
        )}
      </section>
      {preferences && (
        <div className="notification-settings-footer">
          <p role="status">
            {saving
              ? 'Saving your preferences…'
              : dirty
                ? 'You have unsaved changes.'
                : 'Your preferences are up to date.'}
          </p>
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </form>
  );
}

function NotificationSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="notification-switch">
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
