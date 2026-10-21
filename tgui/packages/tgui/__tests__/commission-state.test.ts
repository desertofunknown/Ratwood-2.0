import { expect, test } from 'bun:test';

import {
  coin,
  type CommissionDraft,
  deriveCommissionState,
  getCommissionDisabledReason,
  RECOVERY_TYPE,
} from '../interfaces/ContractLedgerSteward/commissionState';
import type {
  BlockadeRecallEntry,
  StewardData,
} from '../interfaces/ContractLedgerSteward/types';

type Draft = CommissionDraft & { destination: string; inflight: boolean };
const draft = (patch: Partial<Draft> = {}): Draft => ({
  type: 'Recovery',
  region: 'North',
  funding: 'pledge',
  bonusPayLevel: 0,
  destination: 'Town',
  inflight: false,
  ...patch,
});
const recall = (
  patch: Partial<BlockadeRecallEntry> = {},
): BlockadeRecallEntry => ({
  region: 'North',
  recall_eligible: false,
  recall_blocker: 'Already answered',
  seconds_until_recallable: 0,
  refund: 7,
  refund_fund: 'pledge',
  ...patch,
});
const data = (patch: Partial<StewardData> = {}): StewardData => ({
  pledge_balance: 100,
  pledge_refill_base: 5,
  pledge_refill_per_player: 1,
  pledge_active_players: 2,
  pledge_available: true,
  pledge_guild_bonus: 0,
  pledge_golden_active: true,
  crown_purse_balance: 100,
  defense_costs: { Recovery: 7.9, Hunt: 3, 'Blockade Defense': 5 },
  defense_regions_by_type: {
    Recovery: ['North', 'South'],
    Hunt: [],
    'Blockade Defense': ['North'],
  },
  blockade_region_labels: {},
  region_tp_multipliers: {},
  defense_destinations: ['Town'],
  defense_log: [],
  blockade_recall_list: [recall(), recall({ recall_eligible: true })],
  blockade_recall_window_seconds: 30,
  bonus_pay_light_mult: 1.25,
  bonus_pay_full_mult: 1.5,
  directives_per_day: 2,
  directives_issued_today: 0,
  is_alderman_acting: false,
  ...patch,
});

// Independent reference for the pre-extraction ComposeView at
// 1c4167f39d39e50b8400a3b6dbe8927623d83b1b. Keep this oracle independent of
// production helpers/constants: it records the original calculations and order.
const originalCommission = (input: StewardData, selected: Draft) => {
  const { type, region, funding, bonusPayLevel, destination, inflight } =
    selected;
  const isBlockade = type === 'Blockade Defense';
  let recallEntry: BlockadeRecallEntry | undefined;
  if (isBlockade && region) {
    for (const entry of input.blockade_recall_list || []) {
      if (entry.region === region) {
        recallEntry = entry;
        break;
      }
    }
  }
  const bonusLightMult = input.bonus_pay_light_mult ?? 1.25;
  const bonusFullMult = input.bonus_pay_full_mult ?? 1.5;
  const effectiveLevel = funding === 'directive' ? 0 : bonusPayLevel;
  const bonusMult = [1, bonusLightMult, bonusFullMult][effectiveLevel];
  const cost = input.defense_costs?.[type] ?? 0;
  let scaledCost = cost;
  if (effectiveLevel > 0) scaledCost = Math.floor(cost * bonusMult);
  const directivesRemaining =
    (input.directives_per_day ?? 0) - (input.directives_issued_today ?? 0);
  const state = {
    aldermanActing: Boolean(input.is_alderman_acting),
    regionsForType: input.defense_regions_by_type?.[type] || [],
    cost,
    needsDestination: type === 'Recovery',
    isBlockade,
    recallEntry,
    regionHasActiveWrit: Boolean(recallEntry),
    directivesRemaining,
    pledgeAvailable: Boolean(input.pledge_available),
    bonusLightMult,
    bonusFullMult,
    bonusPayEligible: funding !== 'directive',
    effectiveLevel,
    bonusMult,
    scaledCost,
    effectiveCost: funding === 'directive' ? 0 : scaledCost,
  };
  const reasons: [boolean, string][] = [
    [inflight, 'Drafting...'],
    [!type, 'Pick a commission type.'],
    [!region && isBlockade, 'No blockade to clear.'],
    [!region, 'Pick a region.'],
    [
      isBlockade && Boolean(recallEntry),
      'A writ is already in circulation for this blockade.',
    ],
    [type === 'Recovery' && !destination, 'Pick the shipment destination.'],
    [
      funding === 'pledge' && !input.pledge_available,
      'The Burgher Pledge is unavailable.',
    ],
    [
      funding === 'pledge' && input.pledge_balance < scaledCost,
      `Insufficient Pledge (need ${scaledCost}m, have ${input.pledge_balance}m).`,
    ],
    [
      funding === 'crown' && input.crown_purse_balance < scaledCost,
      `Insufficient Crown's Purse (need ${scaledCost}m, have ${input.crown_purse_balance}m).`,
    ],
    [
      funding === 'directive' && directivesRemaining <= 0,
      "Today's directive quota is spent.",
    ],
  ];
  return { state, disabledReason: reasons.find(([blocked]) => blocked)?.[1] };
};

const assertMatchesOriginal = (input: StewardData, selected: Draft) => {
  const expected = originalCommission(input, selected);
  const actual = deriveCommissionState(input, selected);
  expect(actual).toStrictEqual(expected.state);
  if (expected.state.recallEntry) {
    expect(actual.recallEntry).toBe(expected.state.recallEntry);
  } else {
    expect(actual.recallEntry).toBeUndefined();
  }
  const regions = input.defense_regions_by_type?.[selected.type];
  if (regions) expect(actual.regionsForType).toBe(regions);
  const reason = getCommissionDisabledReason(input, selected, actual);
  if (expected.disabledReason === undefined) {
    expect(reason).toBeUndefined();
  } else {
    expect(reason).toBe(expected.disabledReason);
  }
};

test('commission constants and fractional base costs retain their original meaning', () => {
  expect(RECOVERY_TYPE).toBe('Recovery');
  expect(coin(7.9)).toBe('7.9m');
  expect(coin(0)).toBe('0m');
  const input = data();
  for (const [bonusPayLevel, expectedCost] of [
    [0, 7.9],
    [1, 9],
    [2, 11],
  ] as const) {
    const selected = draft({ bonusPayLevel });
    const state = deriveCommissionState(input, selected);
    expect(state.scaledCost).toBe(expectedCost);
    expect(state.effectiveCost).toBe(expectedCost);
    assertMatchesOriginal(input, selected);
  }
  const zeroMultiplier = deriveCommissionState(
    data({ bonus_pay_light_mult: 0 }),
    draft({ bonusPayLevel: 1 }),
  );
  expect(zeroMultiplier.bonusMult).toBe(0);
  expect(zeroMultiplier.scaledCost).toBe(0);
});

test('directives suppress the effective bonus and cost without changing the draft', () => {
  const input = data();
  const selected = Object.freeze(
    draft({ funding: 'directive', bonusPayLevel: 2 }),
  );
  const state = deriveCommissionState(input, selected);
  expect(state.bonusPayEligible).toBe(false);
  expect(state.effectiveLevel).toBe(0);
  expect(state.bonusMult).toBe(1);
  expect(state.scaledCost).toBe(7.9);
  expect(state.effectiveCost).toBe(0);
  expect(selected.bonusPayLevel).toBe(2);
  expect(getCommissionDisabledReason(input, selected, state)).toBeUndefined();
});

test('recall selects the first matching object regardless of eligibility and retains region arrays', () => {
  const input = data();
  for (const type of ['Recovery', 'Hunt', 'Blockade Defense']) {
    const state = deriveCommissionState(input, draft({ type }));
    expect(state.regionsForType).toBe(input.defense_regions_by_type[type]);
    if (type === 'Blockade Defense') {
      expect(state.recallEntry).toBe(input.blockade_recall_list[0]);
      expect(state.recallEntry?.recall_eligible).toBe(false);
      expect(state.regionHasActiveWrit).toBe(true);
    } else {
      expect(state.recallEntry).toBeUndefined();
      expect(state.regionHasActiveWrit).toBe(false);
    }
  }
  for (const region of ['', 'South']) {
    const state = deriveCommissionState(
      input,
      draft({ type: 'Blockade Defense', region }),
    );
    expect(state.recallEntry).toBeUndefined();
    expect(state.regionHasActiveWrit).toBe(false);
  }
});

test('missing legacy fields use original defaults, including unavailable pledge and zero quota', () => {
  // Older backend payloads may omit fields that the current schema requires.
  const legacy = { pledge_balance: 10, crown_purse_balance: 20 } as StewardData;
  const selected = draft();
  expect(deriveCommissionState(legacy, selected)).toStrictEqual({
    aldermanActing: false,
    regionsForType: [],
    cost: 0,
    needsDestination: true,
    isBlockade: false,
    recallEntry: undefined,
    regionHasActiveWrit: false,
    directivesRemaining: 0,
    pledgeAvailable: false,
    bonusLightMult: 1.25,
    bonusFullMult: 1.5,
    bonusPayEligible: true,
    effectiveLevel: 0,
    bonusMult: 1,
    scaledCost: 0,
    effectiveCost: 0,
  });
  assertMatchesOriginal(legacy, selected);
  assertMatchesOriginal(legacy, draft({ type: 'Blockade Defense' }));
  assertMatchesOriginal(legacy, draft({ funding: 'directive' }));
  const nullable = {
    ...legacy,
    defense_costs: null,
    defense_regions_by_type: null,
    blockade_recall_list: null,
    bonus_pay_light_mult: null,
    bonus_pay_full_mult: null,
    directives_per_day: null,
    directives_issued_today: null,
  } as unknown as StewardData;
  assertMatchesOriginal(
    nullable,
    draft({ type: 'Blockade Defense', bonusPayLevel: 2 }),
  );
});

test('refusal precedence remains inflight, type, region, active writ, destination, then funding', () => {
  const input = data({
    pledge_available: false,
    pledge_balance: -1,
    crown_purse_balance: -1,
    directives_issued_today: 3,
  });
  const cases: [Partial<Draft>, string][] = [
    [{ inflight: true, type: '', region: '', destination: '' }, 'Drafting...'],
    [{ type: '', region: '', destination: '' }, 'Pick a commission type.'],
    [{ region: '', destination: '' }, 'Pick a region.'],
    [{ type: 'Blockade Defense', region: '' }, 'No blockade to clear.'],
    [
      { type: 'Blockade Defense' },
      'A writ is already in circulation for this blockade.',
    ],
    [{ destination: '' }, 'Pick the shipment destination.'],
    [{}, 'The Burgher Pledge is unavailable.'],
    [{ funding: 'crown' }, "Insufficient Crown's Purse (need 7.9m, have -1m)."],
    [{ funding: 'directive' }, "Today's directive quota is spent."],
  ];
  for (const [patch, reason] of cases) {
    const selected = draft(patch);
    expect(
      getCommissionDisabledReason(
        input,
        selected,
        deriveCommissionState(input, selected),
      ),
    ).toBe(reason);
  }
  for (const funding of ['pledge', 'crown'] as const) {
    const selected = draft({ funding, bonusPayLevel: 1 });
    for (const balance of [8, 9]) {
      const input = data({
        pledge_balance: balance,
        crown_purse_balance: balance,
      });
      const reason = getCommissionDisabledReason(
        input,
        selected,
        deriveCommissionState(input, selected),
      );
      if (balance === 9) {
        expect(reason).toBeUndefined();
      } else {
        expect(reason).toBe(
          funding === 'pledge'
            ? 'Insufficient Pledge (need 9m, have 8m).'
            : "Insufficient Crown's Purse (need 9m, have 8m).",
        );
      }
    }
  }
});

test('deterministic combination grid matches the pre-extraction state and rejection oracle', () => {
  const profiles = [
    data(),
    data({
      pledge_available: 0,
      pledge_balance: 0,
      crown_purse_balance: 0,
      directives_issued_today: 3,
      is_alderman_acting: 1,
    }),
    { pledge_balance: 0, crown_purse_balance: 0 } as StewardData,
  ];
  for (const input of profiles) {
    for (const type of [
      '',
      'Recovery',
      'Hunt',
      'Blockade Defense',
      'Unknown',
    ]) {
      for (const region of ['', 'North', 'South']) {
        for (const funding of ['pledge', 'crown', 'directive'] as const) {
          for (const bonusPayLevel of [0, 1, 2] as const) {
            for (const destination of ['', 'Town']) {
              for (const inflight of [false, true]) {
                assertMatchesOriginal(input, {
                  type,
                  region,
                  funding,
                  bonusPayLevel,
                  destination,
                  inflight,
                });
              }
            }
          }
        }
      }
    }
  }
});

test('seeded differential cases preserve custom multipliers, balances and optional legacy fields', () => {
  let seed = 0x1c4167f3;
  const pick = <T>(values: readonly T[]): T => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[Math.floor((seed / 0x100000000) * values.length)];
  };
  for (let iteration = 0; iteration < 512; iteration++) {
    const cost = pick([0, 0.01, 1, 3, 7.9, 19, 101.5, 999]);
    const input = data({
      defense_costs: { Recovery: cost, Hunt: cost, 'Blockade Defense': cost },
      pledge_balance: pick([-1, 0, cost, Math.floor(cost * 1.25), 1000]),
      crown_purse_balance: pick([-1, 0, cost, Math.floor(cost * 1.5), 1000]),
      pledge_available: pick([false, true, 0, 1]),
      is_alderman_acting: pick([false, true, 0, 1]),
      bonus_pay_light_mult: pick([undefined, 0, 0.75, 1, 1.25, 1.333, 2]),
      bonus_pay_full_mult: pick([undefined, 0, 1, 1.5, 1.75, 2.25]),
      directives_per_day: pick([undefined, 0, 1, 2, 4]),
      directives_issued_today: pick([undefined, 0, 1, 2, 5]),
      blockade_recall_list: pick([
        undefined,
        [],
        [recall()],
        [
          recall({ region: 'South' }),
          recall({ recall_eligible: true }),
          recall(),
        ],
      ]),
    });
    const selected = draft({
      type: pick(['', 'Recovery', 'Hunt', 'Blockade Defense', 'Unknown']),
      region: pick(['', 'North', 'South']),
      destination: pick(['', 'Town']),
      funding: pick(['pledge', 'crown', 'directive'] as const),
      bonusPayLevel: pick([0, 1, 2] as const),
      inflight: pick([false, true]),
    });
    const before = structuredClone({ input, selected });
    assertMatchesOriginal(input, selected);
    expect({ input, selected }).toStrictEqual(before);
  }
});
