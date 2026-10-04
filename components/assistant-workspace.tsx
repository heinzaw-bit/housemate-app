'use client';

import { ArrowUpRight, ChevronDown, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ApiRequestError,
  type AssistantAnswer,
  type AssistantTopic,
  askAssistant,
  getAssistantConfig,
  type Household,
} from '@/lib/api';
import { moneyCreateHref } from '@/lib/dashboard';
import { useLeaveGuard } from '@/lib/pending-work';
import styles from './assistant-workspace.module.css';
import { HouseMateMascot } from './housemate-mascot';
import { SavedDraftNotice, useSavedDraft } from './saved-draft';

const questions: { topic: AssistantTopic; label: string; title: string }[] = [
  { topic: 'summary', label: 'What needs attention?', title: 'Catch me up' },
  { topic: 'bills', label: 'Which bills are due?', title: 'Bills to watch' },
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
  const [message, setMessage] = useState('');
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
  useLeaveGuard(!!message.trim() || busy);

  const savedDraft = useSavedDraft({
    kind: 'assistant',
    enabled: !!message.trim(),
    value: { message, action: 'null' },
    validate: (snapshot) => snapshot.action === 'null',
    restore: (snapshot) => setMessage(snapshot.message),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone changes invalidate saved questions and pending answers.
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
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

  const hadWork = useRef(false);
  useEffect(() => {
    if (hadWork.current && !busy && enabled) questionInput.current?.focus();
    hadWork.current = busy;
  }, [busy, enabled]);

  function submitQuestion() {
    if (enabled && message.trim() && !current.current)
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
    if (current.current) return;
    if (question.message && savedDraft.pending) {
      setError(
        'Resume or discard your saved question before starting another question.',
      );
      return;
    }
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setPendingQuestion(label);
    setError('');
    setStatus('Checking household records…');
    try {
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
      if (question.message && answer.kind === 'answer') {
        savedDraft.clear();
        setMessage('');
      }
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
        savedDraft.clear();
        setTurns([]);
        setEnabled(false);
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
    if (enabled) questionInput.current?.focus();
    else firstSuggestion.current?.focus();
  }

  return (
    <div className={`content-inner ${styles.workspace}`}>
      <SavedDraftNotice draft={savedDraft} disabled={busy} />
      <header className={styles.header}>
        <HouseHelper />
        <div>
          <h1>What can I help with?</h1>
          <p>{household.name} · Household questions &amp; money</p>
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
          <div className={styles.inputArea}>
            <textarea
              id="assistant-question"
              ref={questionInput}
              className={`${styles.input} ${busy ? styles.inputBusy : ''}`}
              rows={4}
              enterKeyHint="send"
              maxLength={1000}
              value={message}
              disabled={!enabled || busy}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submitQuestion();
                }
              }}
              placeholder="Ask about your household, bills, balance or upcoming events…"
              aria-describedby="assistant-sharing-notice"
            />
            {busy && (
              <div
                className={styles.thinking}
                role="status"
                aria-label="Assistant is thinking"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className={styles.thinkingMascot} aria-hidden="true">
                  <HouseMateMascot />
                </span>
                <div className={styles.thinkingContent}>
                  <div className={styles.thinkingHeading}>
                    <strong>Looking that up…</strong>
                    <span className={styles.thinkingDots} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <p>{pendingQuestion}</p>
                  <div className={styles.thinkingLines} aria-hidden="true">
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className={styles.sendRow}>
            <span>
              {message.length > 800
                ? `${message.length}/1000`
                : 'Enter to ask · Shift + Enter for a new line'}
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
                disabled={!enabled || !message.trim()}
              >
                <Send size={17} aria-hidden="true" />
                Ask
              </Button>
            )}
          </div>
          <p id="assistant-sharing-notice" className={styles.sharingNotice}>
            {enabled ? (
              <>
                By asking a general question, you acknowledge that Google Gemini
                may use or review it. Keep personal or confidential details out.{' '}
                <a
                  href="https://ai.google.dev/gemini-api/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy details
                </a>
              </>
            ) : (
              'Quick questions stay in HouseMate.'
            )}
          </p>
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
            disabled={busy}
            onClick={() => void ask({ topic }, label)}
          >
            {title}
          </Button>
        ))}
      </fieldset>
      <details className={styles.privacy}>
        <summary>
          How answers work · Privacy{' '}
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div id="assistant-privacy">
          <p>
            General questions may go to Gemini when you press Ask or Enter, as
            explained below the chat box. Keep names, amounts, contact details
            and confidential information out of general questions. Google may
            use or review them under its{' '}
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
            household records; each question is checked independently. The
            Assistant answers questions without creating or changing records.
            Use Board or Money to add records. Unsent questions are saved on
            this device for seven days and can be resumed after reloading.
            Answers stay in this tab. Signing out clears saved questions.
            Nothing is submitted automatically.
          </p>
        </div>
      </details>
      {enabled === false && (
        <p className={styles.notice}>
          Quick questions are ready. Free-text questions will become available
          once AI setup is complete.
        </p>
      )}
      <p className={styles.srOnly} role="status">
        {!busy &&
          (status ||
            (enabled === null && !error
              ? 'Checking assistant availability…'
              : ''))}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!busy && latest && (
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
      <h2 className={styles.answerTitle}>
        {answer.kind === 'clarification'
          ? 'Let’s clarify'
          : {
              summary: 'Your household at a glance',
              balance: 'Your balance',
              bills: 'Bills to watch',
              events: 'Upcoming events',
              meals: 'Meal plans',
              chores: 'Chores',
              shopping: 'Shopping',
              unsupported: 'Here’s what I found',
            }[answer.topic]}
      </h2>
      <AnswerText text={answer.text} />
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

function AnswerText({ text }: { text: string }) {
  // Preserve the API wording and amounts; only separate the leading sentence.
  const parts = text.match(/^([\s\S]*?[.!?])\s+([\s\S]+)$/);
  return (
    <div className={styles.answerText}>
      <p className={styles.answerLead}>{parts?.[1] ?? text}</p>
      {parts && <p className={styles.answerContext}>{parts[2]}</p>}
    </div>
  );
}
