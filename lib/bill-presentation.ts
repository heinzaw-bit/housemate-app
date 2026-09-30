import { type BillPreview, formatCurrency } from './api';

export function displayBillPreview(preview: BillPreview) {
  const money = (amountMinor: number) =>
    formatCurrency(amountMinor, preview.currency);
  return {
    total: money(preview.amountMinor),
    charges: money(preview.chargeMinor),
    credits: money(preview.creditMinor),
    base: money(preview.baseMinor),
    shares: preview.shares.map((share) => ({
      memberId: share.memberId,
      displayName: share.displayName,
      base: money(share.baseMinor),
      adjustment: `${share.adjustmentMinor < 0 ? '−' : '+'}${money(Math.abs(share.adjustmentMinor))}`,
      final: money(share.amountMinor),
    })),
    allocatedTotal: money(
      preview.shares.reduce((sum, share) => sum + share.amountMinor, 0),
    ),
  };
}
