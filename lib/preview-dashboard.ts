import type { Dashboard, Household } from './api';

// Only the explicitly labelled /preview workspace uses this sample snapshot.
export function previewDashboard(household: Household): Dashboard {
  const generatedAt = '2026-11-15T03:00:00.000Z';
  return {
    householdId: household.id,
    generatedAt,
    timezone: household.timezone,
    today: '2026-11-15',
    dueSoonDays: 7,
    balance: {
      householdId: household.id,
      currency: household.defaultCurrency,
      viewerMemberId: 'preview-member',
      members: [
        {
          memberId: 'preview-member',
          displayName: 'Preview Member',
          status: 'active',
          netMinor: 73000,
          expectedNetMinor: 73000,
          owesMinor: 0,
          owedMinor: 73000,
        },
      ],
      suggestions: [],
      pendingBillCount: 1,
      pendingBillAmountMinor: 205250,
    },
    pendingBills: {
      overdueCount: 0,
      dueSoonCount: 1,
      hasMore: false,
      items: [
        {
          id: 'sample-electricity',
          title: 'Electricity',
          provider: 'Sample utility',
          dueDate: '2026-11-16',
          amountMinor: 205250,
          urgency: 'due_soon',
        },
      ],
    },
    nextMeal: {
      id: 'sample-dinner',
      mealType: 'dinner',
      question: 'Who’s eating together tonight?',
      startsAt: '2026-11-15T12:30:00Z',
      responseDeadline: '2026-11-15T10:00:00Z',
      joiningCount: 6,
      awaitingCount: 3,
    },
    shoppingOpenCount: 5,
    chores: {
      openCount: 3,
      overdueCount: 0,
      nextDue: {
        id: 'sample-trash',
        title: 'Take out the trash',
        dueAt: '2026-11-15T14:00:00Z',
        assigneeDisplayName: 'Preview Member',
      },
    },
    recentActivity: [
      {
        id: 'sample-activity',
        resourceType: 'expense',
        resourceId: 'sample-groceries',
        kind: 'created',
        title: 'Weekly groceries',
        occurredAt: generatedAt,
        actorDisplayName: 'A housemate',
      },
    ],
  };
}
