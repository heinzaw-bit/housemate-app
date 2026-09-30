'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { theme, ready, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="header-icon-button"
      onClick={toggle}
      disabled={!ready}
      aria-label={label}
      aria-pressed={dark}
      title={label}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
