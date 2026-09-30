import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppStatus } from '@/components/app-status';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'HouseMate — House life, in sync',
  description:
    'A calmer way to manage money, plans, and the everyday stuff with your housemates.',
  applicationName: 'HouseMate',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
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
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body>
        <AuthProvider>
          <AppStatus />
          {children}
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
