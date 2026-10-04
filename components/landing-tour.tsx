'use client';

import { useState } from 'react';
import { HomePreview, HousePreview, MoneyPreview } from './landing-previews';

const views = {
  home: {
    label: 'Home',
    title: 'Know what needs attention.',
    description:
      'A shared starting point for upcoming bills, chores, meals, and your personal balance.',
    preview: HomePreview,
  },
  money: {
    label: 'Money',
    title: 'Everyone can see their share.',
    description:
      'Choose who’s involved, review the split, then confirm. Recorded repayments keep balances clear.',
    preview: MoneyPreview,
  },
  house: {
    label: 'Board',
    title: 'Make everyday teamwork easier.',
    description:
      'Keep chores, shopping, meals, and household plans together so the next step is easy to find.',
    preview: HousePreview,
  },
};

export function LandingTour() {
  const [selected, setSelected] = useState<keyof typeof views>('money');
  const { title, description, preview: Preview } = views[selected];
  return (
    <div className="landing-tour">
      <div className="landing-tour-copy">
        <fieldset
          className="landing-tour-controls"
          aria-label="Choose a product preview"
        >
          {(Object.keys(views) as (keyof typeof views)[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={selected === key}
              onClick={() => setSelected(key)}
            >
              {views[key].label}
            </button>
          ))}
        </fieldset>
        <div aria-live="polite" aria-atomic="true">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <p className="landing-tour-caption">
          Illustrative previews with fictional household records.
        </p>
      </div>
      <div className="landing-tour-preview">
        <Preview />
      </div>
    </div>
  );
}
