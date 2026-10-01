'use client';

import { ArrowUpRight, ChevronDown, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ApiRequestError,
  type AssistantActionDraft,
  type AssistantAnswer,
  type AssistantTopic,
  askAssistant,
  getAssistantConfig,
  type Household,
  prepareAssistantDraft,
} from '@/lib/api';
import { moneyCreateHref } from '@/lib/dashboard';
import { useLeaveGuard } from '@/lib/pending-work';
import { AssistantDraftReview } from './assistant-draft-review';
import styles from './assistant-workspace.module.css';
import { HouseMateMascot } from './housemate-mascot';

const questions: { topic: AssistantTopic; label: string; title: string }[] = [
  { topic: 'summary', label: 'What needs attention?', title: 'Catch me up' },
  { topic: 'meals', label: 'What meals are coming up?', title: 'Meal plans' },
  { topic: 'balance', label: 'How much do I owe?', title: 'My balance' },
];
interface Turn {
  id: number;
  question: string;
  answer: AssistantAnswer;
}

export function AssistantWorkspace({
  household,
  token,
}: {
  household: Household;
  token: string;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [draft, setDraft] = useState<{
    value: AssistantActionDraft;
    token: string;
    id: number;
  } | null>(null);
  const scope = useRef({ token, householdId: household.id });
  scope.current = { token, householdId: household.id };
  const activeDraft =
    draft?.token === token &&
    draft.value.householdId === household.id &&
    draft.value.timezone === household.timezone
      ? draft
      : null;
  const [message, setMessage] = useState('');
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const questionInput = useRef<HTMLTextAreaElement | null>(null);
  const firstSuggestion = useRef<HTMLButtonElement | null>(null);
  const latest = turns.at(-1);
  const earlier = turns.slice(0, -1).reverse();
  const current = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  useLeaveGuard(!!message.trim() || busy || !!activeDraft);

  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone changes invalidate local-time drafts and pending preparation.
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
    setActionsEnabled(false);
    setDraft(null);
    setPrivacyAcknowledged(false);
    setMessage('');
    setBusy(false);
    setStatus('');
    setPendingQuestion('');
    setTurns([]);
    setError('');
    getAssistantConfig(token, household.id, controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) {
          setEnabled(config.naturalLanguageEnabled);
          setActionsEnabled(config.actionDraftsEnabled === true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Assistant availability could not be checked. Try a quick question, or refresh this page.',
          );
      });
    return () => {
      controller.abort();
      current.current?.abort();
      current.current = null;
    };
  }, [token, household.id, household.timezone]);

  const hadDraft = useRef(false);
  useEffect(() => {
    if (hadDraft.current && !activeDraft && (enabled || actionsEnabled))
      questionInput.current?.focus();
    hadDraft.current = !!activeDraft;
  }, [activeDraft, enabled, actionsEnabled]);

  function submitQuestion() {
    if (
      (actionsEnabled || (enabled && privacyAcknowledged)) &&
      message.trim() &&
      !current.current &&
      !activeDraft
    )
      void ask(
        { message: message.trim(), privacyAcknowledged: true },
        message.trim(),
      );
  }

  async function ask(
    question:
      | { topic: AssistantTopic; message?: never }
      | { message: string; topic?: never; privacyAcknowledged: true },
    label: string,
  ) {
    if (current.current || activeDraft) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setPendingQuestion(label);
    setError('');
    setStatus('Checking household records…');
    try {
      if (question.message && actionsEnabled) {
        const prepared = await prepareAssistantDraft(
          token,
          household.id,
          question.message,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (prepared.draft) {
          if (prepared.draft.householdId !== household.id)
            throw new Error('The draft does not belong to this household.');
          setDraft({ value: prepared.draft, token, id: ++nextId.current });
          setMessage('');
          setStatus(
            'Draft ready. Complete the details, review and confirm to save.',
          );
          return;
        }
        if (!enabled || !privacyAcknowledged) {
          setError(
            enabled
              ? 'This is a general question. Confirm the Gemini privacy notice before sending it. Action drafts stay in HouseMate.'
              : 'Try “Plan dinner tomorrow at 7pm” or “Announce that dinner is ready.” General questions are awaiting AI setup.',
          );
          setStatus('');
          return;
        }
      }
      const answer = await askAssistant(
        token,
        household.id,
        question,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const id = ++nextId.current;
      setTurns((previous) =>
        [...previous, { id, question: label, answer }].slice(-6),
      );
      if (question.message) setMessage('');
      setStatus(
        answer.kind === 'clarification'
          ? 'Your question needs clarification.'
          : 'Answer ready.',
      );
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        failure instanceof ApiRequestError &&
        ['UNAUTHENTICATED', 'NOT_FOUND', 'FORBIDDEN'].includes(failure.code)
      ) {
        setTurns([]);
        setEnabled(false);
        setActionsEnabled(false);
        setDraft(null);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : 'The answer could not be loaded. Try a quick question or open the relevant page.',
      );
      setStatus('');
    } finally {
      if (current.current === controller) {
        current.current = null;
        setBusy(false);
      }
    }
  }

  function clearAnswers() {
    setTurns([]);
    setStatus('Answers cleared.');
    if (enabled || actionsEnabled) questionInput.current?.focus();
    else firstSuggestion.current?.focus();
  }

  return (
    <div className={`content-inner ${styles.workspace}`}>
      <header className={styles.header}>
        <HouseHelper />
        <div>
          <h1>What can I help with?</h1>
          <p>{household.name} · Questions, meal plans &amp; money</p>
        </div>
      </header>

      <section className={styles.composer} aria-label="Ask HouseMate">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <label className={styles.srOnly} htmlFor="assistant-question">
            Ask your own question
          </label>
          <textarea
            id="assistant-question"
            ref={questionInput}
            className={styles.input}
            rows={4}
            maxLength={1000}
            value={message}
            disabled={(!enabled && !actionsEnabled) || busy || !!activeDraft}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submitQuestion();
              }
            }}
            placeholder="Ask a question, or draft a meal, shopping item, chore, expense or bill…"
            aria-describedby="assistant-privacy"
          />
          <div className={styles.sendRow}>
            <span>
              {message.length > 800
                ? `${message.length}/1000`
                : 'Ctrl / ⌘ + Enter to send'}
            </span>
            {busy ? (
              <Button
                type="button"
                variant="outline"
                className={styles.send}
                onClick={() => {
                  current.current?.abort();
                  current.current = null;
                  setBusy(false);
                  setStatus('Question cancelled.');
                }}
              >
                Cancel question
              </Button>
            ) : (
              <Button
                type="submit"
                className={styles.send}
                disabled={
                  (!actionsEnabled && (!enabled || !privacyAcknowledged)) ||
                  !message.trim() ||
                  !!activeDraft
                }
              >
                <Send size={17} aria-hidden="true" />
                Ask
              </Button>
            )}
          </div>
          {enabled !== false && (message.trim() || privacyAcknowledged) && (
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={privacyAcknowledged}
                disabled={!enabled || busy || !!activeDraft}
                onChange={(event) =>
                  setPrivacyAcknowledged(event.target.checked)
                }
              />
              <span>
                For general questions: my question has no personal or
                confidential details. I understand Google may use or review it.
              </span>
            </label>
          )}
        </form>
      </section>

      <fieldset
        className={styles.shortcuts}
        aria-label="Quick household questions"
      >
        {questions.map(({ topic, title, label }) => (
          <Button
            key={topic}
            ref={topic === 'summary' ? firstSuggestion : undefined}
            variant="ghost"
            className={styles.shortcut}
            aria-label={`${title}: ${label}`}
            disabled={busy || !!activeDraft}
            onClick={() => void ask({ topic }, label)}
          >
            {title}
          </Button>
        ))}
      </fieldset>
      <details className={styles.privacy}>
        <summary>
          Draft commands stay in HouseMate · Privacy{' '}
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div id="assistant-privacy">
          <p>
            Action commands are interpreted locally by HouseMate. General
            questions go to Gemini only after your acknowledgement. Keep names,
            amounts, contact details and confidential information out of general
            questions. Google may use or review them under its{' '}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              free service terms
            </a>
            .
          </p>
          <p>
            Quick questions stay in HouseMate. Answers use your current
            household records; each question is checked independently. Meal
            checks, announcements, shopping, chores, expenses and bills use
            editable drafts and explicit confirmation. Money shares come from
            the API preview. Drafts and the six most recent answers stay in this
            tab only; reloading loses unfinished drafts.
          </p>
        </div>
      </details>
      {enabled === false && (
        <p className={styles.notice}>
          Quick questions are ready.{' '}
          {actionsEnabled && 'Editable action drafts are ready too. '}
          Free-text questions will become available once AI setup is complete.
        </p>
      )}
      <p className={styles.srOnly} role="status">
        {status ||
          (enabled === null && !error
            ? 'Checking assistant availability…'
            : '')}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {busy && (
        <div className={styles.thinking}>
          <span>Checking: {pendingQuestion}</span>
        </div>
      )}
      {activeDraft && (
        <AssistantDraftReview
          key={activeDraft.id}
          draft={activeDraft.value}
          household={household}
          token={token}
          onCancel={() => {
            setDraft(null);
            setStatus('Draft cancelled. Nothing was saved.');
            questionInput.current?.focus();
          }}
          onPublished={(kind, recordId, title) => {
            if (
              scope.current.token !== token ||
              scope.current.householdId !== household.id
            )
              return;
            const money = kind === 'expense' || kind === 'bill';
            const view = {
              meal: 'meals',
              announcement: 'announcements',
              chore: 'chores',
              shopping: 'shopping',
              expense: 'expenses',
              bill: 'bills',
            }[kind];
            const parameter = money
              ? 'record'
              : kind === 'shopping'
                ? 'item'
                : kind;
            const href = `${money ? '/money' : '/house'}?view=${view}&household=${encodeURIComponent(household.id)}&${parameter}=${encodeURIComponent(recordId)}`;
            const answer: AssistantAnswer = {
              kind: 'answer',
              topic: kind === 'meal' ? 'meals' : 'unsupported',
              text: `${{ meal: 'Meal check', announcement: 'Announcement', chore: 'Chore', shopping: 'Shopping item', expense: 'Expense', bill: 'Bill' }[kind]} ${kind === 'meal' || kind === 'announcement' ? 'published' : 'saved'}: ${title}`,
              timezone: household.timezone,
              generatedAt: new Date().toISOString(),
              rows: [],
              sources: [{ label: 'Open published record', href }],
              partial: false,
            };
            const publishedTurnId = ++nextId.current;
            setTurns((previous) =>
              [
                ...previous,
                {
                  id: publishedTurnId,
                  question: 'Your confirmed draft',
                  answer,
                },
              ].slice(-6),
            );
            setDraft(null);
            setStatus('Saved successfully.');
            questionInput.current?.focus();
          }}
          onAccessLost={(notice) => {
            if (
              scope.current.token !== token ||
              scope.current.householdId !== household.id
            )
              return;
            setDraft(null);
            setTurns([]);
            setEnabled(false);
            setActionsEnabled(false);
            setError(notice);
          }}
        />
      )}
      {!busy && !activeDraft && latest && (
        <section className={styles.result} aria-label="Latest answer">
          <div className={styles.resultHeading}>
            <p className={styles.question}>{latest.question}</p>
            <Button
              variant="ghost"
              className={styles.clear}
              onClick={clearAnswers}
            >
              Clear answers
            </Button>
          </div>
          <AnswerCard
            key={latest.id}
            turn={latest}
            householdId={household.id}
          />
        </section>
      )}
      {earlier.length > 0 && (
        <details className={styles.history}>
          <summary>
            Earlier answers ({earlier.length})
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ol>
            {earlier.map((turn) => (
              <li key={turn.id}>
                <p className={styles.question}>{turn.question}</p>
                <AnswerCard turn={turn} householdId={household.id} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function HouseHelper() {
  return (
    <span className={styles.helper} aria-hidden="true">
      <HouseMateMascot />
    </span>
  );
}

function AnswerCard({
  turn: { id, question, answer },
  householdId,
}: {
  turn: Turn;
  householdId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? answer.rows : answer.rows.slice(0, 3);
  return (
    <article className={styles.answer} aria-label={`Answer to ${question}`}>
      {answer.kind === 'clarification' && (
        <h2 className={styles.clarification}>Let’s clarify</h2>
      )}
      <p className={styles.answerText}>{answer.text}</p>
      {answer.rows.length > 0 && (
        <ul id={`assistant-records-${id}`} className={styles.records}>
          {visibleRows.map((row) => (
            <li key={row.href}>
              <Link href={row.href}>
                <span>
                  <strong>{row.label}</strong>
                  <span className={styles.detail}>{row.detail}</span>
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {answer.rows.length > 3 && (
        <Button
          variant="ghost"
          className={styles.expand}
          aria-expanded={expanded}
          aria-controls={`assistant-records-${id}`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? 'Show fewer records'
            : `Show ${answer.rows.length - 3} more record${answer.rows.length - 3 === 1 ? '' : 's'}`}
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      )}
      {answer.partial && (
        <p className={styles.notice}>
          This answer shows a limited set of records. Open the source page for
          the full list.
        </p>
      )}
      <nav className={styles.sources} aria-label={`Sources for ${question}`}>
        {answer.sources.map((source) => (
          <Link key={source.href} href={source.href}>
            {source.label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      {answer.topic === 'meals' && (
        <Link
          className={styles.nextAction}
          href={`/house?view=meals&household=${encodeURIComponent(householdId)}&add=1`}
        >
          Plan a meal
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      )}
      {(answer.topic === 'balance' || answer.topic === 'bills') && (
        <Link
          className={styles.nextAction}
          href={moneyCreateHref(householdId, 'expenses')}
        >
          Calculate a split
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      )}
      <p className={styles.timestamp}>
        Checked{' '}
        <time dateTime={answer.generatedAt}>
          {new Intl.DateTimeFormat('en', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: answer.timezone,
          }).format(new Date(answer.generatedAt))}
        </time>{' '}
        · {answer.timezone}. Ask again to refresh.
      </p>
    </article>
  );
}
