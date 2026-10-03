'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowLeft, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { hasPendingWork, usePendingWork } from '@/lib/pending-work';
import styles from './money-record-panel.module.css';

export function MoneyRecordPanel({
  open,
  title,
  onClose,
  locked = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);
  const pending = usePendingWork();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        if (locked || hasPendingWork()) {
          details.cancel();
          setBlocked(true);
          return;
        }
        setBlocked(false);
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.panel}>
          <div className={styles.header}>
            <Dialog.Close
              className={styles.back}
              aria-label={`Back from ${title}`}
            >
              <ArrowLeft size={18} aria-hidden="true" /> Back
            </Dialog.Close>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Dialog.Close
              className={styles.close}
              aria-label={`Close ${title}`}
            >
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Review household records. Close to return to the overview.
          </Dialog.Description>
          {blocked && (locked || pending) && (
            <p role="alert" className={styles.warning}>
              {locked
                ? 'Wait for the current action to finish before closing this view.'
                : 'Finish or cancel your open draft before closing this view.'}
            </p>
          )}
          <div className={styles.body}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MoneyRecordTabs({
  details,
  activity,
}: {
  details: ReactNode;
  activity: ReactNode;
}) {
  return (
    <Tabs.Root defaultValue="details" className={styles.tabs}>
      <Tabs.List aria-label="Record information" className={styles.tabList}>
        <Tabs.Tab value="details" className={styles.tab}>
          Details
        </Tabs.Tab>
        <Tabs.Tab value="activity" className={styles.tab}>
          Activity
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="details" className={styles.tabPanel}>
        {details}
      </Tabs.Panel>
      <Tabs.Panel value="activity" className={styles.tabPanel}>
        {activity}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
