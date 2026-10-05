import { LandingPage } from '@/components/landing-page';
import './landing.css';

export const metadata = {
  title: 'HouseMate — House life, in sync',
  description:
    'Split shared expenses, organize chores, plan meals, and keep your household informed in one place.',
  openGraph: {
    title: 'HouseMate — House life, in sync',
    description: 'A calmer way to manage a shared home.',
    type: 'website',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
