import type { MemberBalance } from './api';

// Choose the API-calculated balance; clients never calculate bill effects.
export function balancePresentation(
  member: MemberBalance,
  unpaidBillCount: number,
) {
  const includesUnpaid =
    member.expectedNetMinor !== undefined && unpaidBillCount > 0;
  return {
    amountMinor: member.expectedNetMinor ?? member.netMinor,
    note: includesUnpaid
      ? 'Includes unpaid bills'
      : unpaidBillCount > 0
        ? 'Confirmed balance only'
        : null,
  };
}

export function balanceLabel(amountMinor: number, personal = false) {
  if (amountMinor < 0) return personal ? 'You owe' : 'Owes';
  if (amountMinor > 0) return personal ? 'You’re owed' : 'Is owed';
  return personal ? 'You’re settled up' : 'Settled up';
}
