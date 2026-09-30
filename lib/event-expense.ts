import type { HouseholdEvent, HouseholdMember } from './api';

export function suggestedEventParticipants(
  event: HouseholdEvent,
  activeMembers: HouseholdMember[],
): string[] {
  const activeIds = new Set(activeMembers.map((member) => member.id));
  return event.attendees
    .filter(
      (person) => person.response === 'going' && activeIds.has(person.memberId),
    )
    .map((person) => person.memberId);
}
