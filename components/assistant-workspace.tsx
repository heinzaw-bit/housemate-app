'use client';

import { ArrowUpRight, Send, Sparkles } from 'lucide-react';
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
import { useLeaveGuard } from '@/lib/pending-work';
import styles from './assistant-workspace.module.css';

const questions: { topic: AssistantTopic; label: string }[] = [
  { topic: 'summary', label: 'What needs attention?' },
  { topic: 'balance', label: 'How much do I owe?' },
  { topic: 'bills', label: 'Which bills are unpaid?' },
  { topic: 'chores', label: 'What chores are open?' },
  { topic: 'shopping', label: 'What do we need to buy?' },
  { topic: 'meals', label: 'What meals are coming up?' },
  { topic: 'events', label: 'What events are coming up?' },
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
        [{ id, question: label, answer }, ...previous].slice(0, 6),
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

  return (
    <div className="content-inner">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">A HELPING HAND</span>
          <h1>
            Your <em>household helper.</em>
          </h1>
          <p>
            Find an answer in {household.name}, then open the records behind it.
          </p>
        </div>
      </div>
      <section
        className={styles.panel}
        aria-labelledby="assistant-question-heading"
      >
        <div className={styles.heading}>
          <Sparkles aria-hidden="true" size={24} />
          <h2 id="assistant-question-heading">What would you like to know?</h2>
        </div>
        <p className={styles.muted}>
          Start with a quick question. Each answer checks your household’s
          current records.
        </p>
        <fieldset
          className={styles.prompts}
          aria-label="Quick household questions"
        >
          {questions.map((question) => (
            <Button
              key={question.topic}
              variant="outline"
              disabled={busy}
              onClick={() =>
                void ask({ topic: question.topic }, question.label)
              }
            >
              {question.label}
            </Button>
          ))}
        </fieldset>
        {enabled === false && (
          <p className={styles.notice}>
            Quick questions are ready. Free-text questions will become available
            once AI setup is complete.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (enabled && privacyAcknowledged && message.trim())
              void ask(
                { message: message.trim(), privacyAcknowledged: true },
                message.trim(),
              );
          }}
        >
          <label className={styles.label} htmlFor="assistant-question">
            Ask your own question
          </label>
          <textarea
            id="assistant-question"
            className={styles.input}
            rows={3}
            maxLength={1000}
            value={message}
            disabled={!enabled || busy}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="For example: Who is cooking today?"
            aria-describedby="assistant-privacy"
          />
          <p id="assistant-privacy" className={styles.muted}>
            General questions are sent to Gemini. Google may use or review them
            under its{' '}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              free service terms
            </a>
            . Keep names, amounts, contact details and confidential information
            out. Use Money for a named member’s balance. Household records stay
            in HouseMate; this helper answers questions without changing them.
          </p>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={privacyAcknowledged}
              disabled={!enabled || busy}
              onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
            />{' '}
            My question contains no personal or confidential information. I
            understand Google may use or review it.
          </label>
          <div className={styles.actions}>
            <Button
              type="submit"
              disabled={
                !enabled || busy || !message.trim() || !privacyAcknowledged
              }
            >
              <Send size={16} aria-hidden="true" /> Ask
            </Button>
          </div>
        </form>
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              current.current?.abort();
              current.current = null;
              setBusy(false);
              setStatus('Question cancelled.');
            }}
          >
            Cancel question
          </Button>
        )}
        <p className={styles.muted} role="status">
          {status}
        </p>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
      </section>
      {turns.length > 0 && (
        <div className={styles.historyHeading}>
          <h2>Recent answers</h2>
          <Button variant="ghost" disabled={busy} onClick={() => setTurns([])}>
            Clear answers
          </Button>
        </div>
      )}
      <div className={styles.answers}>
        {turns.map(({ id, question, answer }) => (
          <article
            className={styles.panel}
            key={id}
            aria-labelledby={`assistant-answer-${id}`}
          >
            <span className="eyebrow">
              {answer.kind === 'clarification'
                ? 'LET’S CLARIFY'
                : 'FROM YOUR HOUSEHOLD'}
            </span>
            <h2 id={`assistant-answer-${id}`}>{question}</h2>
            <p>{answer.text}</p>
            {answer.rows.length > 0 && (
              <ul className={styles.records}>
                {answer.rows.map((row) => (
                  <li key={row.href}>
                    <Link href={row.href}>
                      <span>
                        <strong>{row.label}</strong>
                        <span className={styles.detail}>{row.detail}</span>
                      </span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {answer.partial && (
              <p className={styles.notice}>
                This answer shows a limited set of records. Open the source page
                for the full list.
              </p>
            )}
            <nav
              className={styles.sources}
              aria-label={`Sources for ${question}`}
            >
              {answer.sources.map((source) => (
                <Link key={source.href} href={source.href}>
                  {source.label}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <p className={styles.muted}>
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
        ))}
      </div>
    </div>
  );
}
