import { afterEach, expect, test, vi } from 'vitest';
import { type BillDraft, createBill, previewBill } from '../lib/api';
import { displayBillPreview } from '../lib/bill-presentation';

afterEach(() => vi.unstubAllGlobals());

test('nine-member electricity API preview renders the exact final shares and total', async () => {
  const ids = Array.from({ length: 9 }, (_, index) => `member-${index + 1}`);
  const names = [
    'Ethan',
    'Henry',
    'Donut',
    'Johnny',
    'Rio',
    'A',
    'B',
    'C',
    'D',
  ];
  const finals = [
    19574, 25074, 31574, 37073, 21073, 19073, 19072, 19072, 19072,
  ];
  const draft: BillDraft = {
    title: 'Electricity',
    billType: 'electricity',
    provider: 'Utility',
    amountMinor: 210657,
    currency: 'THB',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    dueDate: '2026-09-15',
    payerMemberId: ids[0] ?? '',
    paymentStatus: 'unpaid',
    sharedParticipantIds: ids,
    adjustments: [
      {
        label: 'Ethan',
        kind: 'individual_charge',
        amountMinor: 500,
        memberIds: [ids[0] ?? ''],
      },
      {
        label: 'Henry',
        kind: 'individual_charge',
        amountMinor: 6000,
        memberIds: [ids[1] ?? ''],
      },
      {
        label: 'Donut',
        kind: 'individual_charge',
        amountMinor: 12500,
        memberIds: [ids[2] ?? ''],
      },
      {
        label: 'Johnny',
        kind: 'individual_charge',
        amountMinor: 18000,
        memberIds: [ids[3] ?? ''],
      },
      {
        label: 'Rio',
        kind: 'individual_charge',
        amountMinor: 2000,
        memberIds: [ids[4] ?? ''],
      },
      {
        label: 'Classified shared charge',
        kind: 'shared_charge',
        amountMinor: 20400,
        memberIds: ids,
      },
    ],
  };
  const response = {
    ...draft,
    baseMinor: 151257,
    chargeMinor: 59400,
    creditMinor: 0,
    shares: ids.map((memberId, index) => ({
      memberId,
      displayName: names[index],
      baseMinor: index < 3 ? 16807 : 16806,
      adjustmentMinor: (finals[index] ?? 0) - (index < 3 ? 16807 : 16806),
      amountMinor: finals[index],
    })),
    adjustmentBreakdown: [],
  };
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify(response), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const preview = await previewBill('access-token', 'house-1', draft);
  const displayed = displayBillPreview(preview);
  expect(displayed.base).toBe('฿1,512.57');
  expect(displayed.charges).toBe('฿594.00');
  expect(displayed.shares.map((share) => share.final)).toEqual(
    finals.map((value) =>
      new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100),
    ),
  );
  expect(displayed.allocatedTotal).toBe(displayed.total);
  expect(displayed.total).toBe('฿2,106.57');
  await createBill('access-token', 'house-1', draft, 'retry-uuid');
  const previewBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
  const confirmBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
  expect(previewBody).toEqual(draft);
  expect(confirmBody).toEqual({ ...draft, idempotencyKey: 'retry-uuid' });
});
