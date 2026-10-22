import type { LedgerEntry } from './model';

// Entirely synthetic Crown records. Arrays follow the treasury's append order:
// oldest first in storage, reversed only when a sample page is constructed.
export const emptyEntries: LedgerEntry[] = [];

const duplicate: LedgerEntry = {
  kind: 'transfer',
  from: 'Crown',
  to: 'Sample Lamp Guild',
  amount: 12,
  reason: 'Sample lantern allowance',
};
export const duplicateEntries: LedgerEntry[] = [
  { ...duplicate },
  { ...duplicate },
];

export const edgeEntries: LedgerEntry[] = [
  {
    kind: 'mint',
    from: '',
    to: 'Crown',
    amount: 1250,
    reason: 'Sample minting: copper crowns',
  },
  {
    kind: 'burn',
    from: 'Crown',
    to: '',
    amount: 40,
    reason: 'Sample damaged coins retired',
  },
  {
    kind: 'micro',
    from: 'Sample Mill Guild',
    to: 'Crown',
    amount: 0.125,
    reason: 'Sample fractional levy',
  },
  {
    kind: 'future-kind',
    from: 'Crown',
    to: 'Sample Archive',
    amount: 7,
    reason: 'Sample unknown kind: preserve ordinary transfer display',
  },
  {
    kind: 'transfer',
    from: 'Sample <Weavers> & Guild',
    to: 'Crown',
    amount: 0,
    reason: 'Sample literal <script>not executable</script> [.*] invoice',
  },
  {
    kind: 'mint',
    from: '',
    to: 'Crown',
    amount: -3,
    reason: 'Sample numeric edge: preserve supplied sign without repair',
  },
  {
    kind: 'burn',
    from: 'Crown',
    to: '',
    amount: 0.0000001,
    reason: '',
  },
  ...duplicateEntries.map((entry) => ({ ...entry })),
];

export const longEntries: LedgerEntry[] = [
  {
    kind: 'transfer',
    from: `Sample ${'NorthwardGranary'.repeat(10)}`,
    to: 'Crown',
    amount: 183.5,
    reason: `Sample extended account explanation: ${'A Crown storeroom receipt for replacement lanterns, grain sacks, and hinges. '.repeat(12)}`,
  },
];

export const fiftyOneEntries: LedgerEntry[] = [
  ...Array.from(
    { length: 41 },
    (_, index): LedgerEntry => ({
      kind: 'transfer',
      from: index % 2 ? 'Crown' : `Sample Market Ward ${index + 1}`,
      to: index % 2 ? `Sample Workshop ${index + 1}` : 'Crown',
      amount: index + 1,
      reason:
        index === 0
          ? 'Sample boundary-only needle: oldest Crown receipt'
          : `Sample ${index % 2 ? 'workshop allowance' : 'market levy'} ${index + 1}`,
    }),
  ),
  ...edgeEntries.map((entry) => ({ ...entry })),
  ...longEntries.map((entry) => ({ ...entry })),
];

export const sampleEntries = fiftyOneEntries;
