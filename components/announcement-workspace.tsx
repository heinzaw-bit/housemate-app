'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type Announcement,
  type AnnouncementDraft,
  type AnnouncementScope,
  acknowledgeAnnouncement,
  createAnnouncement,
  getAnnouncement,
  getAnnouncements,
  type Household,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import { useHouseRecords } from '@/lib/use-house-records';
import {
  CommunicationBrowser,
  CommunicationRecipients,
  householdTime,
  useCommunicationMembers,
  usePublicationKey,
} from './communication-parts';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

const scopes = [
  { value: 'all', label: 'All' },
  { value: 'needs_ack', label: 'Needs acknowledgement' },
  { value: 'expired', label: 'Expired' },
];

export function AnnouncementWorkspace({
  household,
  token,
  focusedId = '',
  focusSignal = 0,
  createRequest = 0,
  onHouseChanged,
  compact = false,
}: {
  household: Household;
  token: string;
  focusedId?: string;
  focusSignal?: number;
  createRequest?: number;
  onHouseChanged?: () => void;
  compact?: boolean;
}) {
  const [scope, setScope] = useState<AnnouncementScope>('all');
  const browser = useHouseRecords<Announcement, AnnouncementScope>({
    token,
    householdId: household.id,
    scope,
    loadPage: getAnnouncements,
    getRecord: getAnnouncement,
    focusedId,
    focusSignal,
  });
  const audience = useCommunicationMembers(token, household.id);
  const [formOpen, setFormOpen] = useState(false);
  useLeaveGuard(formOpen);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] =
    useState<AnnouncementDraft['priority']>('normal');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const savedDraft = useSavedDraft({
    kind: 'announcement',
    enabled: formOpen,
    value: {
      title,
      body,
      priority,
      requiresAcknowledgement,
      expiresAtLocal,
      recipientIds,
    },
    seed: () => ({
      title,
      body,
      priority,
      requiresAcknowledgement,
      expiresAtLocal,
      recipientIds: chosenRecipients,
    }),
    restore(snapshot) {
      setTitle(snapshot.title);
      setBody(snapshot.body);
      setPriority(snapshot.priority);
      setRequiresAcknowledgement(snapshot.requiresAcknowledgement);
      setExpiresAtLocal(snapshot.expiresAtLocal);
      setRecipientIds(snapshot.recipientIds);
      setFormOpen(true);
      setReviewing(false);
    },
  });

  const publicationKey = usePublicationKey();
  const chosenRecipients =
    recipientIds ?? audience.members.map((member) => member.id);

  useEffect(() => {
    if (createRequest) setFormOpen(true);
  }, [createRequest]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!title.trim() || !body.trim() || !chosenRecipients.length) {
      setFormError(
        'Enter a title and message, and choose at least one recipient.',
      );
      return;
    }
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setSaving(true);
    try {
      const draft = {
        title: title.trim(),
        body: body.trim(),
        priority,
        requiresAcknowledgement,
        expiresAtLocal: expiresAtLocal || null,
        recipientIds: [...chosenRecipients].sort(),
      };
      const published = await createAnnouncement(token, household.id, {
        ...draft,
        idempotencyKey: savedDraft.confirmationKey(
          draft,
          publicationKey.forDraft(draft),
        ),
      });
      savedDraft.clear();
      browser.accept(published);
      setScope('all');
      setFormOpen(false);
      setReviewing(false);
      setTitle('');
      setBody('');
      setPriority('normal');
      setRequiresAcknowledgement(false);
      setExpiresAtLocal('');
      setRecipientIds(null);
      publicationKey.reset();
      setNotice('Announcement published to the selected recipients.');
      onHouseChanged?.();
      void browser.refresh(true);
    } catch (failure) {
      savedDraft.reject(failure);
      setFormError(
        failure instanceof Error
          ? failure.message
          : 'Could not publish. Retry with the same message to check whether it was saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function acknowledge(record: Announcement) {
    setAcknowledging(true);
    setActionError('');
    try {
      const updated = await acknowledgeAnnouncement(
        token,
        household.id,
        record.id,
      );
      browser.accept(updated);
      setNotice('Your acknowledgement was recorded.');
      onHouseChanged?.();
      void browser.refresh(true);
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : 'Could not save your acknowledgement.',
      );
      void browser.refresh(true);
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <CommunicationBrowser
      title="Announcements"
      compact={compact}
      subtitle="Share updates with the people who need them."
      createOpen={formOpen}
      draftNotice={
        <SavedDraftNotice
          draft={savedDraft}
          disabled={saving}
          resumeDisabled={!!audience.error || !audience.members.length}
        />
      }
      onToggleCreate={() => {
        if (formOpen) savedDraft.clear();
        setFormOpen((old) => !old);
      }}
      form={
        <Card>
          <CardHeader>
            <CardTitle>
              {reviewing ? 'Review announcement' : 'New announcement'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Published text and recipients stay fixed so acknowledgements refer
              to the same message.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void submit(event)}
              className="space-y-4"
            >
              {audience.error && (
                <div role="alert" className="text-sm text-destructive">
                  {audience.error}{' '}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void audience.refresh()}
                  >
                    Retry members
                  </Button>
                </div>
              )}
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              {reviewing ? (
                <div className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
                  <p className="capitalize font-medium">{priority} priority</p>
                  <h3 className="font-heading text-lg">{title}</h3>
                  <p className="whitespace-pre-wrap">{body}</p>
                  <p>
                    <strong>Recipients:</strong>{' '}
                    {audience.members
                      .filter((member) => chosenRecipients.includes(member.id))
                      .map((member) => member.displayName)
                      .join(', ')}
                  </p>
                  <p>
                    {requiresAcknowledgement
                      ? 'Acknowledgement requested'
                      : 'No acknowledgement requested'}
                  </p>
                  {expiresAtLocal && (
                    <p>
                      Expires {expiresAtLocal.replace('T', ' ')} (
                      {household.timezone})
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <label
                    htmlFor="announcement-title"
                    className="block space-y-1.5 text-sm font-medium"
                  >
                    Title
                    <Input
                      id="announcement-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={160}
                      required
                      disabled={saving}
                      placeholder="Landlord visit tomorrow"
                    />
                  </label>
                  <label
                    htmlFor="announcement-body"
                    className="block space-y-1.5 text-sm font-medium"
                  >
                    Message
                    <textarea
                      id="announcement-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      maxLength={4000}
                      required
                      disabled={saving}
                      rows={5}
                      className="w-full rounded-xl border bg-background px-3 py-2 font-normal"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label
                      htmlFor="announcement-priority"
                      className="block space-y-1.5 text-sm font-medium"
                    >
                      Priority
                      <select
                        id="announcement-priority"
                        value={priority}
                        onChange={(event) =>
                          setPriority(
                            event.target.value as AnnouncementDraft['priority'],
                          )
                        }
                        disabled={saving}
                        className="h-9 w-full rounded-xl border bg-background px-3"
                      >
                        <option value="normal">Normal</option>
                        <option value="important">Important</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                    <label
                      htmlFor="announcement-expiry"
                      className="block space-y-1.5 text-sm font-medium"
                    >
                      Expiry (optional, {household.timezone})
                      <Input
                        id="announcement-expiry"
                        type="datetime-local"
                        value={expiresAtLocal}
                        onChange={(event) =>
                          setExpiresAtLocal(event.target.value)
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={requiresAcknowledgement}
                      onChange={(event) =>
                        setRequiresAcknowledgement(event.target.checked)
                      }
                      disabled={saving}
                    />
                    Ask recipients to acknowledge
                  </label>
                  <CommunicationRecipients
                    label="Recipients"
                    members={audience.members}
                    selectedIds={chosenRecipients}
                    onChange={setRecipientIds}
                    disabled={saving}
                  />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {reviewing && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setReviewing(false)}
                  >
                    Edit draft
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={saving || !audience.members.length}
                >
                  {saving
                    ? 'Publishing…'
                    : reviewing
                      ? 'Publish announcement'
                      : 'Review announcement'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      }
      scopes={scopes}
      scope={scope}
      onScope={(next) => {
        setScope(next as AnnouncementScope);
        browser.close();
        setActionError('');
      }}
      records={
        compact
          ? [...browser.records].sort((a, b) => {
              const rank = (record: Announcement) =>
                record.expired
                  ? 0
                  : { normal: 0, important: 1, urgent: 2 }[record.priority];
              return (
                rank(b) - rank(a) ||
                Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
                a.id.localeCompare(b.id)
              );
            })
          : browser.records
      }
      selected={browser.selected}
      loading={browser.loading}
      detailLoading={browser.detailLoading}
      loadingMore={browser.loadingMore}
      hasMore={browser.hasMore}
      error={browser.error}
      updatedAt={browser.updatedAt}
      notice={notice}
      onOpen={(id) => {
        setActionError('');
        void browser.open(id);
      }}
      onClose={browser.close}
      onRefresh={() => void browser.refresh()}
      onMore={() => void browser.loadMore()}
      renderRow={(record) => (
        <>
          {(record.priority !== 'normal' || record.expired) && (
            <span
              className={`mb-1 block text-xs font-semibold uppercase ${record.priority === 'urgent' ? 'text-destructive' : record.priority === 'important' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {record.priority}
              {record.expired ? ' · Expired' : ''}
            </span>
          )}
          <strong className="block break-words">{record.title}</strong>
          <span className="my-1 line-clamp-2 break-words text-sm text-muted-foreground">
            {record.body}
          </span>
          <span className="block text-sm text-muted-foreground">
            {record.authorDisplayName} ·{' '}
            {householdTime(record.publishedAt, household.timezone)}
          </span>
          {record.canAcknowledge && (
            <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              Acknowledgement needed
            </span>
          )}
        </>
      )}
      renderDetail={(record) => {
        const mine = record.recipients.find(
          (person) => person.memberId === record.viewerMemberId,
        );
        return (
          <div className="space-y-4 text-sm">
            <div>
              <span
                className={`text-xs font-semibold uppercase ${record.priority === 'urgent' ? 'text-destructive' : 'text-primary'}`}
              >
                {record.priority}
                {record.expired ? ' · Expired' : ''}
              </span>
              <h3 className="font-heading text-xl">{record.title}</h3>
              <p className="text-muted-foreground">
                {record.authorDisplayName} ·{' '}
                {householdTime(record.publishedAt, record.timezone)}
              </p>
            </div>
            <p className="whitespace-pre-wrap">{record.body}</p>
            {record.expiresAt && (
              <p className="text-muted-foreground">
                {record.expired ? 'Expired' : 'Expires'}{' '}
                {householdTime(record.expiresAt, record.timezone)}
              </p>
            )}
            {actionError && (
              <p role="alert" className="text-destructive">
                {actionError}
              </p>
            )}
            {record.requiresAcknowledgement ? (
              <>
                {mine?.acknowledgedAt ? (
                  <p className="rounded-xl bg-primary/10 p-3 text-primary">
                    You acknowledged this on{' '}
                    {householdTime(mine.acknowledgedAt, record.timezone)}.
                  </p>
                ) : record.canAcknowledge ? (
                  <Button
                    disabled={acknowledging}
                    onClick={() => void acknowledge(record)}
                  >
                    {acknowledging ? 'Saving…' : 'I have read this'}
                  </Button>
                ) : (
                  <p className="text-muted-foreground">
                    {record.expired
                      ? 'Acknowledgements are closed.'
                      : 'You are viewing this as the author or a household administrator.'}
                  </p>
                )}
                <p className="font-medium">
                  {record.counts.acknowledged} of {record.counts.total}{' '}
                  acknowledged · {record.counts.awaiting} active recipients
                  awaiting
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                No acknowledgement requested.
              </p>
            )}
            <div>
              <h4 className="font-medium">Recipients</h4>
              <ul className="mt-2 divide-y divide-border">
                {record.recipients.map((person) => (
                  <li
                    key={person.memberId}
                    className="flex flex-wrap justify-between gap-2 py-2"
                  >
                    <span>
                      {person.displayName}
                      {!person.active ? ' · Former member' : ''}
                    </span>
                    <span className="text-muted-foreground">
                      {person.acknowledgedAt
                        ? 'Acknowledged'
                        : !record.requiresAcknowledgement
                          ? 'No acknowledgement needed'
                          : !person.active
                            ? 'Inactive'
                            : record.expired
                              ? 'Not acknowledged'
                              : 'Awaiting'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      }}
    />
  );
}
