import type { Metadata, Viewport } from 'next';
import { type ReactNode, Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AppStatus } from '@/components/app-status';
import { EntryLoading } from '@/components/home-entry';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { AuthProvider } from '@/lib/auth-context';
import { themeInitScript } from '@/lib/theme';
import { ThemeProvider } from '@/lib/theme-context';
import './globals.css';
import './workspace-design.css';
import localFont from 'next/font/local';
import { cn } from '@/lib/utils';

const dmSans = localFont({
  src: '../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});
const manrope = localFont({
  src: '../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  variable: '--font-design-heading',
  display: 'swap',
  weight: '200 800',
});

export const metadata: Metadata = {
  title: 'HouseMate — House life, in sync',
  description:
    'A calmer way to manage money, plans, and the everyday stuff with your housemates.',
  applicationName: 'HouseMate',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg?v=mascot-1',
    apple: '/apple-touch-icon.png?v=mascot-1',
  },
  appleWebApp: { capable: true, title: 'HouseMate', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#14513f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn('font-sans', dmSans.variable, manrope.variable)}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static theme bootstrap from application code only.
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AppStatus />
            <Suspense fallback={<EntryLoading />}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
