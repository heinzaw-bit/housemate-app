'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type AnnouncementDraft,
  ApiRequestError,
  type AssistantActionDraft,
  createAnnouncement,
  createMeal,
  type Household,
  type MealDraft,
} from '@/lib/api';
import { confirmationFailure } from '@/lib/financial-confirmation';
import { AssistantRecordDraft } from './assistant-record-draft';
import { CommunicationRecipients } from './communication-parts';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

type Attempt =
  | { kind: 'meal'; payload: MealDraft }
  | { kind: 'announcement'; payload: AnnouncementDraft };

function CommunicationDraftReview({
  draft,
  household,
  token,
  onCancel,
  onPublished,
  onAccessLost,
  resumeSavedFields = false,
}: {
  draft: Extract<AssistantActionDraft, { kind: 'meal' | 'announcement' }>;
  household: Household;
  token: string;
  onCancel: () => void;
  onPublished: (
    kind: 'meal' | 'announcement',
    id: string,
    title: string,
  ) => void;
  onAccessLost: (message: string) => void;
  resumeSavedFields?: boolean;
}) {
  const [meal, setMeal] = useState(
    draft.kind === 'meal'
      ? draft.fields
      : {
          mealType: 'other' as const,
          question: '',
          startsAtLocal: '',
          responseDeadlineLocal: '',
        },
  );
  const [announcement, setAnnouncement] = useState(
    draft.kind === 'announcement'
      ? draft.fields
      : {
          title: '',
          body: '',
          priority: 'normal' as const,
          requiresAcknowledgement: false,
          expiresAtLocal: null,
        },
  );
  const [recipients, setRecipients] = useState(draft.recipientIds);
  const [reviewing, setReviewing] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const active = useRef(true);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const savedDraft = useSavedDraft({
    kind: `assistant-editor-${draft.kind}`,
    enabled: true,
    autoResume: resumeSavedFields,
    value: { meal, announcement, recipients },
    restore(snapshot) {
      setMeal(snapshot.meal);
      setAnnouncement(snapshot.announcement);
      setRecipients(snapshot.recipients);
      setReviewing(false);
    },
  });
  const cancelSaved = () => {
    savedDraft.clear();
    onCancel();
  };
  useEffect(() => {
    active.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => {
      active.current = false;
    };
  }, []);

  function review() {
    setError('');
    if (!recipients.length) {
      setError('Choose at least one household member.');
      return;
    }
    if (draft.kind === 'meal') {
      if (
        !meal.question.trim() ||
        meal.question.trim().length > 240 ||
        !meal.startsAtLocal ||
        !meal.responseDeadlineLocal
      ) {
        setError('Enter a question, meal time and response deadline.');
        return;
      }
      if (meal.responseDeadlineLocal >= meal.startsAtLocal) {
        setError('Responses must close before the meal starts.');
        return;
      }
    } else if (!announcement.title.trim() || !announcement.body.trim()) {
      setError('Enter an announcement title and message.');
      return;
    }
    setReviewing(true);
    heading.current?.focus({ preventScroll: true });
  }

  async function publish() {
    if (inFlight.current || !reviewing) return;
    const next: Attempt =
      attempt ??
      (draft.kind === 'meal'
        ? {
            kind: 'meal',
            payload: {
              ...meal,
              question: meal.question.trim(),
              participantIds: [...recipients].sort(),
              cookingRoles: [],
              idempotencyKey: crypto.randomUUID(),
            },
          }
        : {
            kind: 'announcement',
            payload: {
              ...announcement,
              title: announcement.title.trim(),
              body: announcement.body.trim(),
              recipientIds: [...recipients].sort(),
              idempotencyKey: crypto.randomUUID(),
            },
          });
    inFlight.current = true;
    setAttempt(next);
    setSaving(true);
    setError('');
    try {
      const { idempotencyKey: proposedKey, ...fields } = next.payload;
      const key = savedDraft.confirmationKey(fields, proposedKey);
      const published =
        next.kind === 'meal'
          ? await createMeal(token, household.id, {
              ...next.payload,
              idempotencyKey: key,
            })
          : await createAnnouncement(token, household.id, {
              ...next.payload,
              idempotencyKey: key,
            });
      if (active.current) {
        savedDraft.clear();
        onPublished(
          next.kind,
          published.id,
          next.kind === 'meal' ? meal.question : announcement.title,
        );
      }
    } catch (failure) {
      savedDraft.reject(failure);
      if (!active.current) return;
      if (
        failure instanceof ApiRequestError &&
        [401, 403, 404].includes(failure.status)
      ) {
        savedDraft.clear();
        onAccessLost(failure.message);
        return;
      }
      // A lost response might already have published. Freeze its exact payload/key.
      // Only a definitive failure on the first attempt permits editing.
      // A later rejection cannot disprove an earlier uncertain publication.
      if (
        !attempt &&
        failure instanceof ApiRequestError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        failure.status !== 409
      ) {
        setAttempt(null);
        setReviewing(false);
      }
      setError(confirmationFailure(failure, 'publication'));
    } finally {
      inFlight.current = false;
      if (active.current) setSaving(false);
    }
  }

  const isMeal = draft.kind === 'meal';
  return (
    <Card className="mt-5" aria-label="Assistant action draft">
      <CardHeader>
        <CardTitle ref={heading} tabIndex={-1}>
          {reviewing
            ? 'Review before publishing'
            : isMeal
              ? 'Draft meal check'
              : 'Draft announcement'}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {household.name} · {draft.timezone} ·{' '}
          {reviewing
            ? 'Publish now to the selected members.'
            : 'Unsaved draft. Edit the details below.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <SavedDraftNotice draft={savedDraft} disabled={saving} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!reviewing && (
          <>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {[...draft.notes, ...draft.unresolvedFields].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                review();
              }}
              className="space-y-4"
            >
              {isMeal ? (
                <>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-question`}
                  >
                    <span>Meal question</span>
                    <Input
                      id={`${id}-question`}
                      required
                      maxLength={240}
                      value={meal.question}
                      onChange={(event) =>
                        setMeal({ ...meal, question: event.target.value })
                      }
                    />
                  </label>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-type`}
                  >
                    <span>Meal type</span>
                    <select
                      id={`${id}-type`}
                      className="w-full rounded-md border bg-background p-2"
                      value={meal.mealType}
                      onChange={(event) =>
                        setMeal({
                          ...meal,
                          mealType: event.target.value as MealDraft['mealType'],
                        })
                      }
                    >
                      {['breakfast', 'lunch', 'dinner', 'other'].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label
                      className="block min-w-0 space-y-1 text-sm"
                      htmlFor={`${id}-start`}
                    >
                      <span>Meal date and time ({draft.timezone})</span>
                      <Input
                        id={`${id}-start`}
                        type="datetime-local"
                        required
                        value={meal.startsAtLocal}
                        onChange={(event) =>
                          setMeal({
                            ...meal,
                            startsAtLocal: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label
                      className="block min-w-0 space-y-1 text-sm"
                      htmlFor={`${id}-deadline`}
                    >
                      <span>Responses close ({draft.timezone})</span>
                      <Input
                        id={`${id}-deadline`}
                        type="datetime-local"
                        required
                        value={meal.responseDeadlineLocal}
                        onChange={(event) =>
                          setMeal({
                            ...meal,
                            responseDeadlineLocal: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-title`}
                  >
                    <span>Announcement title</span>
                    <Input
                      id={`${id}-title`}
                      required
                      maxLength={160}
                      value={announcement.title}
                      onChange={(event) =>
                        setAnnouncement({
                          ...announcement,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-body`}
                  >
                    <span>Message</span>
                    <textarea
                      id={`${id}-body`}
                      className="w-full rounded-md border bg-background p-3 text-base"
                      rows={4}
                      required
                      maxLength={4000}
                      value={announcement.body}
                      onChange={(event) =>
                        setAnnouncement({
                          ...announcement,
                          body: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-priority`}
                  >
                    <span>Priority</span>
                    <select
                      id={`${id}-priority`}
                      className="w-full rounded-md border bg-background p-2"
                      value={announcement.priority}
                      onChange={(event) =>
                        setAnnouncement({
                          ...announcement,
                          priority: event.target
                            .value as AnnouncementDraft['priority'],
                        })
                      }
                    >
                      {['normal', 'important', 'urgent'].map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={announcement.requiresAcknowledgement}
                      onChange={(event) =>
                        setAnnouncement({
                          ...announcement,
                          requiresAcknowledgement: event.target.checked,
                        })
                      }
                    />
                    Ask recipients to acknowledge
                  </label>
                  <label
                    className="block space-y-1 text-sm"
                    htmlFor={`${id}-expiry`}
                  >
                    <span>Optional expiry ({draft.timezone})</span>
                    <Input
                      id={`${id}-expiry`}
                      type="datetime-local"
                      value={announcement.expiresAtLocal ?? ''}
                      onChange={(event) =>
                        setAnnouncement({
                          ...announcement,
                          expiresAtLocal: event.target.value || null,
                        })
                      }
                    />
                  </label>
                </>
              )}
              <CommunicationRecipients
                members={draft.members}
                selectedIds={recipients}
                onChange={setRecipients}
                disabled={saving}
                label={
                  isMeal
                    ? 'Who should receive this meal check?'
                    : 'Announcement recipients'
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {isMeal ? 'Review meal check' : 'Review announcement'}
                </Button>
                <Button type="button" variant="outline" onClick={cancelSaved}>
                  Cancel draft
                </Button>
              </div>
            </form>
          </>
        )}
        {reviewing && (
          <>
            <div className="space-y-2 rounded-xl border p-4 text-sm break-words">
              <strong>{isMeal ? meal.question : announcement.title}</strong>
              {isMeal ? (
                <>
                  <p>Meal type: {meal.mealType}</p>
                  <p>
                    Meal starts: {meal.startsAtLocal.replace('T', ' ')} ·{' '}
                    {draft.timezone}
                  </p>
                  <p>
                    Responses close:{' '}
                    {meal.responseDeadlineLocal.replace('T', ' ')} ·{' '}
                    {draft.timezone}
                  </p>
                  <p>
                    Cooking roles can be assigned after publication in Board.
                  </p>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{announcement.body}</p>
                  <p>
                    Priority: {announcement.priority} · Acknowledgement:{' '}
                    {announcement.requiresAcknowledgement
                      ? 'Required'
                      : 'Not required'}
                  </p>
                  <p>
                    Expiry:{' '}
                    {announcement.expiresAtLocal?.replace('T', ' ') ?? 'None'}
                    {announcement.expiresAtLocal ? ` · ${draft.timezone}` : ''}
                  </p>
                </>
              )}
              <p>
                Recipients ({recipients.length}):{' '}
                {draft.members
                  .filter((member) => recipients.includes(member.id))
                  .map((member) => member.displayName)
                  .join(', ')}
              </p>
              <p>
                Publication creates household notifications according to
                recipient preferences.
              </p>
            </div>
            {attempt && error && (
              <p className="text-sm text-muted-foreground">
                The original confirmation is locked. Retry it to check the
                publication result; do not create another copy.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void publish()}>
                {saving
                  ? 'Publishing…'
                  : attempt
                    ? 'Retry publication'
                    : 'Confirm and publish'}
              </Button>
              <Button
                variant="outline"
                disabled={saving || !!attempt}
                onClick={() => {
                  setReviewing(false);
                  setError('');
                }}
              >
                Edit draft
              </Button>
              <Button
                variant="ghost"
                disabled={saving || !!attempt}
                onClick={cancelSaved}
              >
                Cancel draft
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface AssistantDraftReviewProps {
  resumeSavedFields?: boolean;
  draft: AssistantActionDraft;
  household: Household;
  token: string;
  onCancel: () => void;
  onPublished: (
    kind: AssistantActionDraft['kind'],
    id: string,
    title: string,
  ) => void;
  onAccessLost: (message: string) => void;
}
export function AssistantDraftReview(props: AssistantDraftReviewProps) {
  if (props.draft.kind === 'meal' || props.draft.kind === 'announcement')
    return <CommunicationDraftReview {...props} draft={props.draft} />;
  return <AssistantRecordDraft {...props} draft={props.draft} />;
}
