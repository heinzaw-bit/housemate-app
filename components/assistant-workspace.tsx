'use client';

import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Home,
  type LucideIcon,
  ReceiptText,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UtensilsCrossed,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { type Ref, useEffect, useRef, useState } from 'react';
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

const questions: {
  topic: AssistantTopic;
  label: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
}[] = [
  {
    topic: 'summary',
    label: 'What needs attention?',
    title: 'Catch me up',
    hint: 'A little overview of home',
    icon: Home,
  },
  {
    topic: 'balance',
    label: 'How much do I owe?',
    title: 'My balance',
    hint: 'See where things stand',
    icon: WalletCards,
  },
  {
    topic: 'chores',
    label: 'What chores are open?',
    title: 'Open chores',
    hint: 'What needs a helping hand',
    icon: ClipboardList,
  },
  {
    topic: 'meals',
    label: 'What meals are coming up?',
    title: 'Meal plans',
    hint: 'See what’s coming up',
    icon: UtensilsCrossed,
  },
  {
    topic: 'bills',
    label: 'Which bills are unpaid?',
    title: 'Unpaid bills',
    icon: ReceiptText,
  },
  {
    topic: 'shopping',
    label: 'What do we need to buy?',
    title: 'Shopping list',
    icon: ShoppingBasket,
  },
  {
    topic: 'events',
    label: 'What events are coming up?',
    title: 'Upcoming events',
    icon: CalendarDays,
  },
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
  const latestAnswer = useRef<HTMLElement | null>(null);
  const questionInput = useRef<HTMLTextAreaElement | null>(null);
  const firstSuggestion = useRef<HTMLButtonElement | null>(null);
  const latestId = turns.at(-1)?.id;
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

  useEffect(() => {
    if (latestId !== undefined)
      latestAnswer.current?.scrollIntoView?.({
        block: 'start',
        behavior: 'instant',
      });
  }, [latestId]);

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

  return (
    <div className={`content-inner ${styles.workspace}`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <HouseHelper />
          <div>
            <h1>HouseMate assistant</h1>
            <p>
              {household.name} <span aria-hidden="true">·</span> A helping hand
            </p>
          </div>
        </div>
        {turns.length > 0 && (
          <Button
            variant="ghost"
            className={styles.clear}
            disabled={busy}
            onClick={() => {
              setTurns([]);
              setStatus('Answers cleared.');
              if (enabled) questionInput.current?.focus();
              else firstSuggestion.current?.focus();
            }}
          >
            Clear answers
          </Button>
        )}
      </header>

      {turns.length === 0 && !busy && (
        <section className={styles.welcome} aria-labelledby="assistant-welcome">
          <div className={styles.welcomeHelper}>
            <HouseHelper />
            <Sparkles className={styles.sparkle} aria-hidden="true" />
          </div>
          <span className="eyebrow">A LITTLE HELP AT HOME</span>
          <h2 id="assistant-welcome">
            House life, <span>a little easier.</span>
          </h2>
          <p>Balances, chores, dinner plans. What’s on your mind?</p>
        </section>
      )}

      {(turns.length > 0 || busy) && (
        <section
          className={styles.conversation}
          aria-labelledby="assistant-conversation"
        >
          <h2 id="assistant-conversation" className={styles.srOnly}>
            Your conversation
          </h2>
          <ol className={styles.turns}>
            {turns.map((turn, index) => (
              <li key={turn.id} className={styles.turn}>
                <p className={styles.userMessage}>
                  <span className={styles.srOnly}>You asked: </span>
                  {turn.question}
                </p>
                <AnswerCard
                  turn={turn}
                  answerRef={
                    index === turns.length - 1 ? latestAnswer : undefined
                  }
                />
              </li>
            ))}
            {busy && (
              <li className={styles.turn}>
                <p className={styles.userMessage}>
                  <span className={styles.srOnly}>You asked: </span>
                  {pendingQuestion}
                </p>
                <div className={styles.thinking} aria-hidden="true">
                  <HouseHelper />
                  <span>Checking your household</span>
                  <span className={styles.dots}>
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </li>
            )}
          </ol>
        </section>
      )}

      <fieldset
        className={`${styles.suggestions} ${turns.length > 0 || busy ? styles.compact : ''}`}
      >
        <legend>
          {turns.length > 0 || busy
            ? 'Ask another quick question'
            : 'A good place to start'}
        </legend>
        <div className={styles.promptGrid}>
          {questions.map(({ topic, label, title, hint, icon: Icon }) => (
            <Button
              key={topic}
              ref={topic === 'summary' ? firstSuggestion : undefined}
              variant="outline"
              className={`${styles.prompt} ${hint ? styles.featured : ''}`}
              aria-label={`${title}: ${label}`}
              disabled={busy}
              onClick={() => void ask({ topic }, label)}
            >
              <span className={styles.promptIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className={styles.promptCopy}>
                <strong>{title}</strong>
                {hint && <span className={styles.promptHint}>{hint}</span>}
              </span>
              {hint && (
                <ArrowUpRight
                  className={styles.promptArrow}
                  size={16}
                  aria-hidden="true"
                />
              )}
            </Button>
          ))}
        </div>
      </fieldset>

      <section className={styles.composer} aria-label="Ask HouseMate">
        {enabled === false && (
          <p className={styles.notice}>
            Quick questions are ready. Free-text questions will become available
            once AI setup is complete.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <label className={styles.srOnly} htmlFor="assistant-question">
            Ask your own question
          </label>
          <div className={styles.inputRow}>
            <textarea
              id="assistant-question"
              ref={questionInput}
              className={styles.input}
              rows={2}
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
              placeholder="For example: Who is cooking today?"
              aria-describedby="assistant-privacy assistant-input-hint"
            />
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
                <span>Ask</span>
              </Button>
            )}
          </div>
          <div className={styles.composerMeta}>
            <p id="assistant-input-hint">
              Each question checks current records.
            </p>
            <span>
              {message.length > 800
                ? `${message.length}/1000`
                : 'Ctrl / ⌘ + Enter to send'}
            </span>
          </div>
          {enabled !== false && (
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
          <details className={styles.privacy}>
            <summary>
              <ShieldCheck size={15} aria-hidden="true" /> Privacy &amp; how
              this works <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div id="assistant-privacy">
              <p>
                Typed questions go to Gemini. Keep names, amounts, contact
                details and confidential information out. Google may use or
                review questions under its{' '}
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
                Quick questions stay in HouseMate. Answers come from your
                household’s records and do not change them. Use Money for a
                named member’s balance. The six most recent answers stay in this
                tab only; each question is checked separately.
              </p>
            </div>
          </details>
        </form>
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
      </section>
    </div>
  );
}

function HouseHelper() {
  return (
    <span className={styles.helper} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path
          d="M11 29 32 12l21 17"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 28v21a5 5 0 0 0 5 5h22a5 5 0 0 0 5-5V28"
          fill="var(--card)"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="35" r="2.5" fill="currentColor" />
        <circle cx="39" cy="35" r="2.5" fill="currentColor" />
        <path
          d="M27 43q5 5 10 0"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M47 13v-5m-2.5 2.5h5"
          stroke="var(--helper-spark)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function AnswerCard({
  turn: { id, question, answer },
  answerRef,
}: {
  turn: Turn;
  answerRef?: Ref<HTMLElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? answer.rows : answer.rows.slice(0, 3);
  return (
    <article
      ref={answerRef}
      className={styles.answer}
      aria-label={`Answer to ${question}`}
    >
      <div className={styles.answerHeader}>
        <HouseHelper />
        <span>HouseMate</span>
        <span className={styles.answerTag}>
          {answer.kind === 'clarification'
            ? 'Let’s clarify'
            : 'From your household'}
        </span>
      </div>
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
