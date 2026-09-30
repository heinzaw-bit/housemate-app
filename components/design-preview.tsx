'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiUser, Household } from '@/lib/api';
import { type Section, Workspace } from './workspace';

const previewUser: ApiUser = {
  id: 'preview-member',
  displayName: 'Preview Member',
  email: null,
};

const previewHouseholds: Household[] = [
  {
    id: 'preview-thb',
    name: 'Sukhumvit Flat',
    defaultCurrency: 'THB',
    timezone: 'Asia/Bangkok',
    role: 'owner',
    currencyEditable: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'preview-usd',
    name: 'Maple House',
    defaultCurrency: 'USD',
    timezone: 'America/New_York',
    role: 'member',
    currencyEditable: false,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

const storageKey = 'housemate.designPreviewHousehold';

export function DesignPreview({ section }: { section: Section }) {
  const [selectedId, setSelectedId] = useState(previewHouseholds[0].id);

  useEffect(() => {
    const savedId = window.sessionStorage.getItem(storageKey);
    if (previewHouseholds.some((household) => household.id === savedId)) {
      setSelectedId(savedId as string);
    }
  }, []);

  function selectHousehold(id: string) {
    setSelectedId(id);
    window.sessionStorage.setItem(storageKey, id);
  }

  const household =
    previewHouseholds.find((item) => item.id === selectedId) ??
    previewHouseholds[0];

  return (
    <div className="design-preview">
      <div className="preview-banner" role="note">
        <span>
          <strong>Design preview</strong> · Sample households only. No household
          changes are saved.
        </span>
        <Link href="/">Back to sign-in</Link>
      </div>
      <Workspace
        section={section}
        me={previewUser}
        households={previewHouseholds}
        household={household}
        onSelectHousehold={selectHousehold}
        onSignOut={() => window.location.assign('/')}
        signingOut={false}
        signOutError=""
        preview
      />
    </div>
  );
}
