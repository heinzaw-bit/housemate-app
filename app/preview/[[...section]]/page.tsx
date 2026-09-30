import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignPreview } from '@/components/design-preview';
import type { Section } from '@/components/workspace';

export const metadata: Metadata = {
  title: 'Design preview · HouseMate',
  robots: { index: false, follow: false },
};

const sections = new Set<Section>([
  'home',
  'money',
  'house',
  'assistant',
  'profile',
]);

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const { section: segments = [] } = await params;
  const section = segments[0] ?? 'home';
  if (segments.length > 1 || !sections.has(section as Section)) notFound();

  return <DesignPreview section={section as Section} />;
}
