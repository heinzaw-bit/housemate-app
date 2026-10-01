'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';

type Panel = { id: string; label: string; content: ReactNode };

export function LandingSections({
  panels,
  children,
}: {
  panels: Panel[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const focusSection = useRef(false);

  useEffect(() => {
    function readLocation() {
      const index = panels.findIndex(
        (panel) => `#${panel.id}` === window.location.hash,
      );
      const next = index < 0 ? 0 : index;
      // Back/forward may hide the currently focused section.
      focusSection.current = Boolean(
        main.current?.contains(document.activeElement),
      );
      setActive(next);
    }
    readLocation();
    window.addEventListener('hashchange', readLocation);
    window.addEventListener('popstate', readLocation);
    return () => {
      window.removeEventListener('hashchange', readLocation);
      window.removeEventListener('popstate', readLocation);
    };
  }, [panels]);

  useEffect(() => {
    if (!focusSection.current) return;
    focusSection.current = false;
    const heading = main.current?.children
      .item(active)
      ?.querySelector<HTMLElement>('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [active]);

  const navigate = useCallback(
    (index: number, moveFocus: boolean) => {
      if (index === active || index < 0 || index >= panels.length) return;
      focusSection.current = moveFocus;
      // Keep Next.js history metadata, search parameters and invitation selectors.
      window.history.pushState(
        window.history.state,
        '',
        `#${panels[index].id}`,
      );
      setActive(index);
    },
    [active, panels],
  );

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // Native anchors also emit click for Enter. Delegate only section links,
    // including links in the server-rendered content and footer.
    function followSection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (
        !anchor ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (anchor.getAttribute('href') === '#landing-main') {
        event.preventDefault();
        main.current?.focus();
        return;
      }
      const index = panels.findIndex(
        (panel) => `#${panel.id}` === anchor.getAttribute('href'),
      );
      if (index < 0) return;
      event.preventDefault();
      navigate(index, true);
    }
    element.addEventListener('click', followSection);
    return () => element.removeEventListener('click', followSection);
  }, [panels, navigate]);

  return (
    <div className="landing landing-guided" ref={root}>
      <a className="skip-link" href="#landing-main">
        Skip to main content
      </a>
      <header className="landing-header">
        <a href="#overview" aria-label="HouseMate overview">
          <Brand />
        </a>
        <nav aria-label="Landing page sections">
          {panels.map((panel, index) => (
            <a
              key={panel.id}
              href={`#${panel.id}`}
              aria-current={active === index ? 'step' : undefined}
            >
              {panel.label}
            </a>
          ))}
        </nav>
        <div className="landing-header-actions">
          <ThemeToggle />
          <Link href="/sign-in" className="landing-sign-in">
            Sign in
          </Link>
          <Link href="/sign-in" className="landing-button landing-header-cta">
            Get started <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main
        id="landing-main"
        className="landing-stage"
        ref={main}
        tabIndex={-1}
      >
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            id={panel.id}
            className="landing-panel"
            hidden={active !== index}
          >
            {panel.content}
          </div>
        ))}
      </main>
      <div className="landing-pagination landing-container">
        <button
          type="button"
          className="landing-step-button"
          disabled={active === 0}
          onClick={() => navigate(active - 1, true)}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Previous
        </button>
        <p aria-live="polite" aria-atomic="true">
          <span>
            {String(active + 1).padStart(2, '0')} /{' '}
            {String(panels.length).padStart(2, '0')}
          </span>
          {panels[active].label}
        </p>
        {active === panels.length - 1 ? (
          <Link href="/sign-in" className="landing-button">
            Get started <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="landing-step-button landing-step-next"
            onClick={() => navigate(active + 1, true)}
          >
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      <noscript>
        <style>
          {
            '.landing-panel[hidden]{display:block}.landing-pagination{display:none}'
          }
        </style>
      </noscript>
    </div>
  );
}
