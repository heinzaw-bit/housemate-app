'use client';

import { ArrowUpRight, ChevronDown, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ApiRequestError,
  type AssistantAnswer,
  type AssistantContextTopic,
  type AssistantTopic,
  askAssistant,
  assistantContextTopics,
  getAssistantConfig,
  type Household,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/pending-work';
import styles from './assistant-workspace.module.css';
import { HouseMateMascot } from './housemate-mascot';

const questions: { topic: AssistantTopic; label: string; title: string }[] = [
  { topic: 'summary', label: 'What needs attention?', title: 'Catch me up' },
  { topic: 'balance', label: 'How much do I owe?', title: 'My balance' },
  { topic: 'board', label: 'What’s new on the Board?', title: 'Board updates' },
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone changes invalidate pending answers.
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
          setEnabled(
            config.naturalLanguageEnabled || config.chatEnabled === true,
          );
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
    if (hadWork.current && !busy && enabled) {
      questionInput.current?.focus();
      if (latest?.answer.kind === 'clarification')
        questionInput.current?.select();
    }
    hadWork.current = busy;
  }, [busy, enabled, latest]);

  function submitQuestion() {
    if (enabled && message.trim() && !current.current)
      void ask(
        {
          message: message.trim(),
          privacyAcknowledged: true,
          ...(latest &&
          assistantContextTopics.some((topic) => topic === latest.answer.topic)
            ? {
                context: {
                  topic: latest.answer.topic as AssistantContextTopic,
                },
              }
            : {}),
        },
        message.trim(),
      );
  }

  async function ask(
    question:
      | { topic: AssistantTopic; message?: never }
      | {
          message: string;
          topic?: never;
          privacyAcknowledged: true;
          context?: { topic: AssistantContextTopic };
        },
    label: string,
  ) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setPendingQuestion(label);
    setError('');
    setStatus('Looking that up…');
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
        setTurns([]);
        setEnabled(false);
      }
      const aiUnavailable =
        failure instanceof ApiRequestError &&
        [
          'AI_LIMIT_REACHED',
          'AI_PROVIDER_LIMIT_REACHED',
          'ASSISTANT_SETUP_REQUIRED',
          'ASSISTANT_UNAVAILABLE',
        ].includes(failure.code);
      setError(
        aiUnavailable
          ? 'I can’t answer that question right now. Try the household shortcuts, or open Board and Money to check your records.'
          : failure instanceof Error
            ? failure.message
            : 'That answer could not be loaded. Try a household shortcut or open Board and Money.',
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
          <h1>Ask HouseMate</h1>
          <p>{household.name} · Your household helper</p>
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
              placeholder="Ask about Board updates, your balance, or an everyday question…"
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
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <div className={styles.recoveryLinks}>
            <Link href={`/house?household=${encodeURIComponent(household.id)}`}>
              Open Board
            </Link>
            <Link href={`/money?household=${encodeURIComponent(household.id)}`}>
              Open Money
            </Link>
          </div>
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
            busy={busy}
            onChoose={(choice) =>
              void ask({ topic: choice.topic }, choice.label)
            }
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
                <AnswerCard turn={turn} />
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
  busy = false,
  onChoose,
}: {
  turn: Turn;
  busy?: boolean;
  onChoose?: (choice: { label: string; topic: AssistantContextTopic }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? answer.rows : answer.rows.slice(0, 3);
  const footerSources = answer.sources.filter(
    (source) => !source.href.includes('view=balances'),
  );
  return (
    <article className={styles.answer} aria-label={`Answer to ${question}`}>
      <h2 className={styles.answerTitle}>
        {answer.kind === 'clarification'
          ? 'Let’s clarify'
          : {
              summary: 'Catch me up',
              board: 'Board updates',
              balance: 'Your balance',
              bills: 'Bills to watch',
              events: 'Upcoming events',
              meals: 'Meal plans',
              chores: 'Chores',
              shopping: 'Shopping',
              announcements: 'Household announcements',
              greeting: 'Hello!',
              about: 'Meet HouseMate',
              general: 'Everyday advice',
              unsupported: 'Here’s what I found',
            }[answer.topic]}
      </h2>
      {answer.topic === 'general' ? (
        <GeneralAnswer text={answer.text} />
      ) : (
        <AnswerText text={answer.text} />
      )}
      {answer.topic === 'general' && (
        <p className={styles.answerMeta}>
          General AI answer · Check important details.
        </p>
      )}
      {answer.kind === 'clarification' &&
        onChoose &&
        !!answer.choices?.length && (
          <fieldset
            className={styles.choices}
            aria-label="Choose what to check"
          >
            {answer.choices.map((choice) => (
              <Button
                key={choice.topic}
                variant="outline"
                disabled={busy}
                onClick={() => onChoose(choice)}
              >
                {choice.label}
              </Button>
            ))}
          </fieldset>
        )}
      {answer.rows.length > 0 && (
        <ul
          id={`assistant-records-${id}`}
          data-motion-expanded={expanded}
          className={styles.records}
        >
          {visibleRows.map((row) => (
            <li key={row.href}>
              <Link href={row.href}>
                <span>
                  <strong>{row.label}</strong>
                  <span className={styles.detail}>{row.detail}</span>
                </span>
                <span className={styles.recordAction}>
                  {recordAction(row.href)}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
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
      {footerSources.length > 0 && (
        <nav className={styles.sources} aria-label={`Sources for ${question}`}>
          {footerSources.map((source) => (
            <Link key={source.href} href={source.href}>
              {sourceAction(source)}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}
      <p className={styles.timestamp}>
        {assistantContextTopics.some((topic) => topic === answer.topic)
          ? 'Checked'
          : 'Answered'}{' '}
        <time dateTime={answer.generatedAt}>
          {new Intl.DateTimeFormat('en', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: answer.timezone,
          }).format(new Date(answer.generatedAt))}
        </time>{' '}
        · {answer.timezone}.
        {assistantContextTopics.some((topic) => topic === answer.topic)
          ? ' Ask again to refresh.'
          : ''}
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

function recordAction(href: string): string {
  if (href.includes('view=announcements')) return 'Open announcement';
  if (href.includes('view=events')) return 'Open event';
  if (href.includes('view=bills')) return 'View bill';
  if (href.includes('view=balances')) return 'View balance';
  return 'Open record';
}
function sourceAction(source: { label: string; href: string }): string {
  if (source.href.includes('view=announcements')) return 'View announcements';
  if (source.href.includes('view=events')) return 'View events';
  if (source.href.includes('view=bills')) return 'View bills';
  if (source.href.includes('view=balances')) return 'View balance';
  if (source.label === 'Board') return 'Open Board';
  return source.label;
}
function GeneralAnswer({ text }: { text: string }) {
  // Plain text only: model output never becomes HTML, links or executable markup.
  const blocks = [...text.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)];
  return (
    <div className={styles.answerText}>
      {blocks.map((block) => {
        const lines = [...block[0].matchAll(/[^\n]+/g)];
        if (
          lines.length > 0 &&
          lines.every((line) => /^[-*•]\s+/.test(line[0]))
        ) {
          return (
            <ul key={block.index} className={styles.generalList}>
              {lines.map((line) => (
                <li key={line.index}>{line[0].replace(/^[-*•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={block.index} className={styles.generalParagraph}>
            {block[0]}
          </p>
        );
      })}
    </div>
  );
}
