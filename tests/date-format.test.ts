import { expect, test } from 'vitest';
import { formatRecordDate } from '../lib/date-format';

test('formats bill and expense calendar dates without shifting the day', () => {
  expect(formatRecordDate('2026-09-28')).toBe('Sep 28, 2026');
});

test('formats void timestamps returned by the API without throwing', () => {
  expect(formatRecordDate('2026-09-28T10:15:30.123Z')).toBe('Sep 28, 2026');
  expect(formatRecordDate('2026-09-28T10:15:30+00:00')).toBe('Sep 28, 2026');
});

test('invalid dates do not crash the financial record screen', () => {
  expect(formatRecordDate('invalid')).toBe('Date unavailable');
  expect(formatRecordDate('')).toBe('Date unavailable');
});
