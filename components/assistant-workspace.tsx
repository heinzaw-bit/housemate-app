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
  useLeaveGuard(!!message.trim() || busy);

  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
    setPrivacyAcknowledged(false);
    setMessage('');
    setBusy(false);
    setStatus('');
    setPendingQuestion('');
    setTurns([]);
    setError('');
    getAssistantConfig(token, household.id, controller.signal)
      .then((config) => {
        if (!controller.signal.aborted)
          setEnabled(config.naturalLanguageEnabled);
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
  }, [token, household.id]);

  function submitQuestion() {
    if (enabled && privacyAcknowledged && message.trim() && !current.current)
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
            disabled={!enabled || busy}
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
            placeholder="Ask about your home, meal plans or money…"
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
                disabled={!enabled || !message.trim() || !privacyAcknowledged}
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
                disabled={!enabled || busy}
                onChange={(event) =>
                  setPrivacyAcknowledged(event.target.checked)
                }
              />
              <span>
                My question has no personal or confidential details. I
                understand Google may use or review it.
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
            disabled={busy}
            onClick={() => void ask({ topic }, label)}
          >
            {title}
          </Button>
        ))}
      </fieldset>
      <details className={styles.privacy}>
        <summary>
          Typed questions go to Gemini · Privacy{' '}
          <ChevronDown size={13} aria-hidden="true" />
        </summary>
        <div id="assistant-privacy">
          <p>
            Keep names, amounts, contact details and confidential information
            out of typed questions. Google may use or review them under its{' '}
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
            household records; each question is checked independently. Planning
            a meal or calculating an expense split opens the normal review flow.
            This assistant does not save or change records. The six most recent
            answers stay in this tab only.
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
