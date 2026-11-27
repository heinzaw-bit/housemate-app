import {
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  Home,
  ListChecks,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { Brand } from './brand';
import { HomePreview } from './landing-previews';
import { LandingSections } from './landing-sections';
import { LandingTour } from './landing-tour';

const features = [
  {
    icon: WalletCards,
    title: 'Split bills and expenses',
    description:
      'Split expenses and bills, understand your balance, and record repayments.',
    tags: ['Flexible splits', 'Clear balances', 'Traceable changes'],
  },
  {
    icon: ListChecks,
    title: 'Share the everyday work',
    description:
      'Share the chores, keep shopping in one place, and plan who’s joining dinner.',
    tags: ['Chores', 'Shopping', 'Meals'],
  },
  {
    icon: Bell,
    title: 'Keep everyone in the loop',
    description:
      'Share announcements, plan events, and collect votes without losing the details.',
    tags: ['Announcements', 'Events', 'Polls'],
  },
];
const questions = [
  [
    'Who is HouseMate for?',
    'Roommates, shared apartments, and households that want one place to coordinate shared money and everyday responsibilities.',
  ],
  [
    'Which currencies can we use?',
    'Choose USD or THB for your household. Shared records and balances use that currency. Currency changes are locked once financial activity begins.',
  ],
  [
    'How do repayments work?',
    'HouseMate records transfers made outside the app. Members review and confirm a manual settlement to update their balances.',
  ],
  [
    'Can I use it on my phone?',
    'Yes. Use HouseMate in your browser, or add it to your home screen using Android Chrome or iPhone Safari. Installation help is available in the app.',
  ],
  [
    'Can I fix a mistaken expense or bill?',
    'Authorized members can edit or remove a mistaken record with a preview and confirmation. Its history remains available so everyone can understand the correction.',
  ],
];

export function LandingPage() {
  return (
    <LandingSections
      panels={[
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <>
              <section
                className="landing-hero landing-container"
                aria-labelledby="landing-title"
              >
                <div className="landing-hero-copy">
                  <h1 id="landing-title">
                    Share a home. <span>Stay in sync.</span>
                  </h1>
                  <p className="landing-hero-description">
                    Split bills, coordinate chores, and plan meals with your
                    housemates in one place.
                  </p>
                  <div className="landing-hero-actions">
                    <Link href="/sign-in" className="landing-button">
                      Set up a household{' '}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                    <a
                      href="#tour"
                      className="landing-button landing-button-secondary"
                    >
                      Take a tour
                    </a>
                  </div>
                  <p className="landing-invite-note">
                    <strong>Have an invitation?</strong> Open the link from your
                    housemate to join their household.
                  </p>
                </div>
                <div className="landing-hero-visual">
                  <div className="landing-browser-frame">
                    <div className="landing-browser-bar" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <span>housemate · your shared home</span>
                    </div>
                    <HomePreview />
                  </div>
                </div>
              </section>
            </>
          ),
        },
        {
          id: 'features',
          label: 'Features',
          content: (
            <section
              className="landing-features landing-container"
              aria-labelledby="landing-features-title"
            >
              <div className="landing-section-intro">
                <h2 id="landing-features-title">What you can do</h2>
              </div>
              <div className="landing-feature-grid">
                {features.map(({ icon: Icon, title, description, tags }) => (
                  <article key={title} className="landing-feature-card">
                    <div className="landing-feature-top">
                      <span>
                        <Icon size={23} aria-hidden="true" />
                      </span>
                    </div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <ul>
                      {tags.map((tag) => (
                        <li key={tag}>
                          <Check size={14} aria-hidden="true" /> {tag}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ),
        },
        {
          id: 'how-it-works',
          label: 'How it works',
          content: (
            <section
              className="landing-how"
              aria-labelledby="landing-how-title"
            >
              <div className="landing-container">
                <div className="landing-section-intro">
                  <h2 id="landing-how-title">How to get started</h2>
                </div>
                <ol className="landing-steps">
                  {[
                    {
                      icon: Home,
                      title: 'Sign in',
                      text: 'Use Google or receive a sign-in link by email.',
                    },
                    {
                      icon: UsersRound,
                      title: 'Create or join a household',
                      text: 'Set up a new household, or open your invitation link to join an existing one.',
                    },
                    {
                      icon: ClipboardList,
                      title: 'Add your first shared item',
                      text: 'Invite housemates, then add an expense, plan a meal, or assign a chore.',
                    },
                  ].map(({ icon: Icon, title, text }, index) => (
                    <li key={title}>
                      <div className="landing-step-mark">
                        <Icon size={25} aria-hidden="true" />
                        <span>0{index + 1}</span>
                      </div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ),
        },
        {
          id: 'tour',
          label: 'Tour',
          content: (
            <section
              className="landing-product landing-container"
              aria-labelledby="landing-product-title"
            >
              <div className="landing-section-intro">
                <h2 id="landing-product-title">Take a quick tour</h2>
              </div>
              <LandingTour />
            </section>
          ),
        },
        {
          id: 'privacy',
          label: 'Privacy',
          content: (
            <section
              className="landing-privacy landing-container"
              aria-labelledby="landing-privacy-title"
            >
              <span className="landing-privacy-icon">
                <ShieldCheck size={30} aria-hidden="true" />
              </span>
              <div>
                <p className="landing-kicker">YOUR HOUSEHOLD’S SPACE</p>
                <h2 id="landing-privacy-title">
                  Shared with the right people.
                </h2>
                <p>
                  Members see the households they belong to. Announcements and
                  polls can have selected audiences, and money changes stay
                  traceable.
                </p>
                <p className="landing-privacy-detail">
                  Sign-in is provided by Supabase. Production error reporting
                  uses Sentry with household content, request details, and
                  personal identifiers removed from reports. Theme preferences
                  and sign-in sessions are stored in your browser.
                </p>
              </div>
            </section>
          ),
        },
        {
          id: 'faq',
          label: 'FAQ',
          content: (
            <>
              <section
                className="landing-faq landing-container"
                aria-labelledby="landing-faq-title"
              >
                <div>
                  <h2 id="landing-faq-title">Common questions</h2>
                </div>
                <div>
                  {questions.map(([question, answer]) => (
                    <details key={question}>
                      <summary>
                        {question}
                        <span aria-hidden="true">+</span>
                      </summary>
                      <p>{answer}</p>
                    </details>
                  ))}
                </div>
              </section>
              <div className="landing-section-cta landing-container">
                <Link href="/sign-in" className="landing-button">
                  Set up a household <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </>
          ),
        },
      ]}
    >
      <footer className="landing-footer landing-container">
        <div>
          <Brand />
          <p>House life, in sync.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#privacy">Privacy overview</a>
          <a href="#faq">Using HouseMate</a>
          <Link href="/sign-in">Sign in</Link>
        </nav>
        <small>© 2026 HouseMate</small>
      </footer>
    </LandingSections>
  );
}
