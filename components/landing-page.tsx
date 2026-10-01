import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Heart,
  Home,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { Brand } from './brand';
import { HomePreview } from './landing-previews';
import { LandingTour } from './landing-tour';
import { ThemeToggle } from './theme-toggle';

const features = [
  {
    icon: WalletCards,
    number: '01',
    title: 'Make shared money clear.',
    description:
      'Split expenses and bills, understand your balance, and record repayments.',
    tags: ['Flexible splits', 'Clear balances', 'Traceable changes'],
  },
  {
    icon: ListChecks,
    number: '02',
    title: 'Keep daily life organized.',
    description:
      'Share the chores, keep shopping in one place, and plan who’s joining dinner.',
    tags: ['Chores', 'Shopping', 'Meals'],
  },
  {
    icon: Bell,
    number: '03',
    title: 'Keep everyone in the loop.',
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
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Skip to main content
      </a>
      <header className="landing-header">
        <Link href="/" aria-label="HouseMate home">
          <Brand />
        </Link>
        <nav aria-label="Landing page navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
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
      <main id="landing-main" tabIndex={-1}>
        <section
          className="landing-hero landing-container"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero-copy">
            <p className="landing-kicker">
              <span /> A SHARED HOME. A LITTLE MORE IN SYNC.
            </p>
            <h1 id="landing-title">
              House life,
              <br />
              <span>in sync.</span>
            </h1>
            <p className="landing-hero-description">
              Split expenses, organize chores, plan meals, and keep everyone
              informed—all in one place.
            </p>
            <div className="landing-hero-actions">
              <Link href="/sign-in" className="landing-button">
                Get started <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className="landing-button landing-button-secondary"
              >
                See how it works
              </a>
            </div>
            <p className="landing-audience">
              <span className="landing-avatar-stack" aria-hidden="true">
                <span>A</span>
                <span>L</span>
                <span>S</span>
              </span>
              For the people you share a home with.
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
            <div className="landing-visual-note">
              <span>
                <Heart size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Better together.</strong>
                <small>A little less chasing. A little more home.</small>
              </div>
            </div>
          </div>
        </section>
        <div className="landing-capabilities landing-container">
          <span>
            <ReceiptText size={18} aria-hidden="true" /> Shared expenses
          </span>
          <span>
            <ListChecks size={18} aria-hidden="true" /> Everyday teamwork
          </span>
          <span>
            <CalendarDays size={18} aria-hidden="true" /> Plans together
          </span>
          <span>
            <Bell size={18} aria-hidden="true" /> Household updates
          </span>
        </div>

        <section
          className="landing-problems landing-container"
          aria-labelledby="landing-problems-title"
        >
          <div>
            <p className="landing-kicker">SOUND FAMILIAR?</p>
            <h2 id="landing-problems-title">
              Sharing a home comes
              <br />
              with a lot of little things.
            </h2>
          </div>
          <div className="landing-problem-list">
            <p>
              <span>“Who paid for the groceries?”</span>
              <span>“Is it my turn to clean?”</span>
              <span>“What did we decide for Friday?”</span>
            </p>
            <p>
              HouseMate gives those details a place to live, so keeping track
              doesn’t fall on one person.
            </p>
          </div>
        </section>

        <section
          id="features"
          className="landing-features landing-container"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-section-intro">
            <p className="landing-kicker">ONE HOME. ONE SHARED PLACE.</p>
            <h2 id="landing-features-title">
              Less to keep track of.
              <br />
              More room for living.
            </h2>
            <p>
              From the monthly bills to tonight’s dinner, everyone can find the
              next step.
            </p>
          </div>
          <div className="landing-feature-grid">
            {features.map(
              ({ icon: Icon, number, title, description, tags }) => (
                <article key={number} className="landing-feature-card">
                  <div className="landing-feature-top">
                    <span>
                      <Icon size={23} aria-hidden="true" />
                    </span>
                    <small>{number}</small>
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
              ),
            )}
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="landing-how-title"
        >
          <div className="landing-container">
            <div className="landing-section-intro">
              <p className="landing-kicker">MAKE YOURSELF AT HOME</p>
              <h2 id="landing-how-title">Start with your people.</h2>
              <p>A few simple steps to a more organized shared home.</p>
            </div>
            <ol className="landing-steps">
              {[
                {
                  icon: Home,
                  title: 'Create your household',
                  text: 'Sign in and give your shared home a name. Choose its currency and timezone.',
                },
                {
                  icon: UsersRound,
                  title: 'Invite your housemates',
                  text: 'Send an invitation link so everyone can join the same household.',
                },
                {
                  icon: ClipboardList,
                  title: 'Start coordinating',
                  text: 'Add a shared expense, plan a meal, or give the next chore a clear owner.',
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

        <section
          className="landing-product landing-container"
          aria-labelledby="landing-product-title"
        >
          <div className="landing-section-intro">
            <p className="landing-kicker">A LOOK INSIDE</p>
            <h2 id="landing-product-title">
              Clear at a glance.
              <br />
              Useful every day.
            </h2>
          </div>
          <LandingTour />
        </section>

        <section
          id="privacy"
          className="landing-privacy landing-container"
          aria-labelledby="landing-privacy-title"
        >
          <span className="landing-privacy-icon">
            <ShieldCheck size={30} aria-hidden="true" />
          </span>
          <div>
            <p className="landing-kicker">YOUR HOUSEHOLD’S SPACE</p>
            <h2 id="landing-privacy-title">Shared with the right people.</h2>
            <p>
              Members see the households they belong to. Announcements and polls
              can have selected audiences, and money changes stay traceable.
            </p>
            <p className="landing-privacy-detail">
              Sign-in is provided by Supabase. Production error reporting uses
              Sentry with household content, request details, and personal
              identifiers removed from reports. Theme preferences and sign-in
              sessions are stored in your browser.
            </p>
          </div>
        </section>

        <section
          id="faq"
          className="landing-faq landing-container"
          aria-labelledby="landing-faq-title"
        >
          <div>
            <p className="landing-kicker">A FEW THINGS TO KNOW</p>
            <h2 id="landing-faq-title">
              Make yourself
              <br />
              comfortable.
            </h2>
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

        <section
          className="landing-final landing-container"
          aria-labelledby="landing-final-title"
        >
          <span className="landing-final-icon">
            <Home size={29} aria-hidden="true" />
          </span>
          <p className="landing-kicker">
            A LITTLE MORE ORGANIZED. A LOT MORE AT HOME.
          </p>
          <h2 id="landing-final-title">
            Your shared home,
            <br />
            on the same page.
          </h2>
          <p>Bring the money, plans, and everyday details together.</p>
          <Link href="/sign-in" className="landing-button">
            Create your household <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
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
    </div>
  );
}
