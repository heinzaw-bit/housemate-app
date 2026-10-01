'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';
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
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = main.current;
    if (!element) return;
    const sections = Array.from(
      element.querySelectorAll<HTMLElement>('.landing-panel'),
    );
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    const reveal = (section: HTMLElement) => {
      section.dataset.reveal = 'visible';
      observer?.unobserve(section);
    };
    function watchSections() {
      observer?.disconnect();
      observer = undefined;
      // Public content is visible before hydration and when animation is unavailable.
      if (
        motion?.matches ||
        typeof window.IntersectionObserver !== 'function'
      ) {
        sections.forEach(reveal);
        return;
      }
      try {
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) reveal(entry.target as HTMLElement);
            }
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0 },
        );
        for (const section of sections) {
          // Never fade out content already in view, a deep-link target or prior reveal.
          if (
            section.dataset.reveal === 'visible' ||
            section.getBoundingClientRect().top < window.innerHeight ||
            section.contains(document.activeElement)
          ) {
            reveal(section);
          } else {
            section.dataset.reveal = 'pending';
            observer.observe(section);
          }
        }
      } catch {
        observer?.disconnect();
        observer = undefined;
        sections.forEach(reveal);
      }
    }
    function revealFocused(event: FocusEvent) {
      const section =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('.landing-panel')
          : null;
      if (section) reveal(section);
    }
    watchSections();
    element.addEventListener('focusin', revealFocused);
    motion?.addEventListener('change', watchSections);
    return () => {
      observer?.disconnect();
      element.removeEventListener('focusin', revealFocused);
      motion?.removeEventListener('change', watchSections);
    };
  }, []);

  return (
    <div className="landing landing-scroll">
      <a className="skip-link" href="#landing-main">
        Skip to main content
      </a>
      <header className="landing-header">
        <a href="#overview" aria-label="HouseMate overview">
          <Brand />
        </a>
        <nav aria-label="Landing page navigation">
          {panels.map((panel) => (
            <a key={panel.id} href={`#${panel.id}`}>
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
        {panels.map((panel) => (
          <div
            key={panel.id}
            id={panel.id}
            className="landing-panel"
            tabIndex={-1}
          >
            {panel.content}
          </div>
        ))}
      </main>
      {children}
    </div>
  );
}
