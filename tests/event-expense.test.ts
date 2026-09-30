import { expect, test } from 'vitest';
import type { HouseholdEvent, HouseholdMember } from '../lib/api';
import { suggestedEventParticipants } from '../lib/event-expense';

test('event expense defaults include only active Going members and never treat Maybe as consent to split', () => {
  const event = {
    attendees: [
      { memberId: 'going', response: 'going' },
      { memberId: 'maybe', response: 'maybe' },
      { memberId: 'declined', response: 'not_going' },
      { memberId: 'former', response: 'going' },
      { memberId: 'awaiting', response: null },
    ],
  } as HouseholdEvent;
  const active = ['going', 'maybe', 'declined', 'awaiting'].map((id) => ({
    id,
  })) as HouseholdMember[];
  expect(suggestedEventParticipants(event, active)).toEqual(['going']);
  expect(
    suggestedEventParticipants({ ...event, attendees: [] }, active),
  ).toEqual([]);
});
