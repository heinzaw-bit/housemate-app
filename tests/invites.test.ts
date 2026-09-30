import { describe, expect, it } from 'vitest';
import { parseInviteInput } from '../lib/invites';

const token = 'A'.repeat(43);

describe('invite input', () => {
  it('accepts a raw invite code or a link on the current app origin', () => {
    expect(parseInviteInput(token, 'http://localhost:3000')).toBe(token);
    expect(
      parseInviteInput(
        `http://localhost:3000/?invite=${token}`,
        'http://localhost:3000',
      ),
    ).toBe(token);
  });

  it('rejects unrelated sites and malformed codes', () => {
    expect(
      parseInviteInput(
        `https://other.example/?invite=${token}`,
        'http://localhost:3000',
      ),
    ).toBeNull();
    expect(parseInviteInput('bad', 'http://localhost:3000')).toBeNull();
  });
});
