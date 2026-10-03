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
      className="header-icon-button header-icon-button-plain"
      onClick={toggle}
      disabled={!ready}
      aria-label={label}
      aria-pressed={dark}
      title={label}
    >
      {dark ? (
        <Sun size={20} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Moon size={20} strokeWidth={2} aria-hidden="true" />
      )}
    </Button>
  );
}
