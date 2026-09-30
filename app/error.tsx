'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  useEffect(() => {
    if (Sentry.isEnabled()) Sentry.captureException(error);
  }, [error]);
  return (
    <main className="content-inner space-y-4 py-10" role="alert">
      <h1 className="text-2xl font-semibold">This page couldn’t load.</h1>
      <p>
        Check your connection and try again. An interrupted save has not been
        verified here; check the related records before creating another entry.
      </p>
      <Button onClick={retry}>Try loading this page again</Button>
    </main>
  );
}
