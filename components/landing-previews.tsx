import {
  Check,
  Circle,
  House,
  ListChecks,
  ReceiptText,
  ShoppingBasket,
  UsersRound,
  WalletCards,
} from 'lucide-react';

// Public illustrations only. Never receive session or household data.
export function HomePreview() {
  return (
    <div className="landing-dashboard">
      <div className="landing-dashboard-side" aria-hidden="true">
        <House size={21} />
        <span className="selected">
          <House size={18} />
        </span>
        <WalletCards size={18} />
        <UsersRound size={18} />
        <span className="landing-sample-avatar">A</span>
      </div>
      <div className="landing-dashboard-main">
        <div className="landing-preview-toolbar">
          <span>Maple House</span>
          <span className="landing-example-label">Example data</span>
        </div>
        <div className="landing-preview-greeting">
          <span>HOME, A LITTLE MORE ORGANIZED</span>
          <p className="landing-preview-title">Good morning, Aye.</p>
          <p>Here’s what’s happening at home.</p>
        </div>
        <div className="landing-preview-summary">
          <div className="landing-preview-balance">
            <WalletCards size={19} />
            <span>Your balance</span>
            <strong>THB +840.00</strong>
            <small>Owed to you · confirmed records</small>
          </div>
          <div className="landing-preview-shopping">
            <ShoppingBasket size={20} />
            <strong>4 items</strong>
            <span>On the shopping list</span>
            <div className="landing-avatar-stack">
              <span>A</span>
              <span>L</span>
              <span>S</span>
            </div>
          </div>
        </div>
        <div className="landing-preview-attention">
          <div>
            <p className="landing-preview-subtitle">Needs attention</p>
            <span>02</span>
          </div>
          <div className="landing-preview-row">
            <span className="landing-mini-icon">
              <ReceiptText size={17} />
            </span>
            <span>
              <strong>Internet bill</strong>
              <small>Due soon · Unpaid</small>
            </span>
            <b>THB 900.00</b>
          </div>
          <div className="landing-preview-row">
            <span className="landing-mini-icon">
              <ListChecks size={17} />
            </span>
            <span>
              <strong>Kitchen clean-up</strong>
              <small>Assigned to Lin · Today</small>
            </span>
            <span className="landing-small-pill">Chore</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoneyPreview() {
  return (
    <div className="landing-money-preview">
      <div className="landing-preview-toolbar">
        <span>
          <ReceiptText size={18} /> Review expense
        </span>
        <span className="landing-example-label">Example data</span>
      </div>
      <div className="landing-money-total">
        <span>Weekly groceries</span>
        <strong>THB 900.00</strong>
        <p>Paid by Aye · Split equally</p>
      </div>
      <div className="landing-split-members">
        {['Aye', 'Lin', 'Sam'].map((name) => (
          <div key={name}>
            <span className="landing-sample-avatar">{name[0]}</span>
            <strong>{name}</strong>
            <span>THB 300.00</span>
          </div>
        ))}
      </div>
      <div className="landing-preview-note">
        <Check size={17} /> Preview first. Confirm when it looks right.
      </div>
    </div>
  );
}

export function HousePreview() {
  return (
    <div className="landing-house-preview">
      <div className="landing-preview-toolbar">
        <span>
          <UsersRound size={18} /> Around the house
        </span>
        <span className="landing-example-label">Example data</span>
      </div>
      <p className="landing-preview-title">
        A little teamwork goes a long way.
      </p>
      <div className="landing-house-list">
        {[
          ['Kitchen clean-up', 'Lin · Today', false],
          ['Take out recycling', 'Sam · Tomorrow', false],
          ['Water the plants', 'Aye · Completed', true],
        ].map(([title, detail, done]) => (
          <div key={String(title)}>
            {done ? <Check size={18} /> : <Circle size={18} />}
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="landing-preview-meal">
        <span>DINNER TOGETHER?</span>
        <strong>Friday dinner</strong>
        <p>2 joining · 1 maybe</p>
        <div className="landing-avatar-stack">
          <span>A</span>
          <span>L</span>
          <span>S</span>
        </div>
      </div>
    </div>
  );
}
