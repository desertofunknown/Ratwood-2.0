import type { FundingSource, StewardData } from './types';

export const RECOVERY_TYPE = 'Recovery';
const BLOCKADE_TYPE = 'Blockade Defense';
export const coin = (n: number) => `${n}m`;

export type CommissionDraft = {
  type: string;
  region: string;
  funding: FundingSource;
  bonusPayLevel: 0 | 1 | 2;
};

export function deriveCommissionState(
  data: StewardData,
  draft: CommissionDraft,
) {
  const { type, region, funding, bonusPayLevel } = draft;
  const aldermanActing = !!data.is_alderman_acting;
  const regionsForType = data.defense_regions_by_type?.[type] || [];
  const cost = data.defense_costs?.[type] ?? 0;
  const needsDestination = type === RECOVERY_TYPE;
  const isBlockade = type === BLOCKADE_TYPE;
  // The picked blockade's recall entry, if any. Present when a writ is already in
  // circulation for that region - the entry tells us whether it is still recallable
  // and drives the Recall button below.
  const recallEntry =
    isBlockade && region
      ? (data.blockade_recall_list || []).find((e) => e.region === region)
      : undefined;
  const regionHasActiveWrit = !!recallEntry;
  const directivesRemaining =
    (data.directives_per_day ?? 0) - (data.directives_issued_today ?? 0);
  const pledgeAvailable = !!data.pledge_available;
  const bonusLightMult = data.bonus_pay_light_mult ?? 1.25;
  const bonusFullMult = data.bonus_pay_full_mult ?? 1.5;
  // Bonus Pay is disabled for Requests (no reward to sweeten, no coin to burn).
  const bonusPayEligible = funding !== 'directive';
  const effectiveLevel = bonusPayEligible ? bonusPayLevel : 0;
  const bonusMult =
    effectiveLevel === 2
      ? bonusFullMult
      : effectiveLevel === 1
        ? bonusLightMult
        : 1;
  const scaledCost = effectiveLevel !== 0 ? Math.floor(cost * bonusMult) : cost;
  const effectiveCost = funding === 'directive' ? 0 : scaledCost;

  return {
    aldermanActing,
    regionsForType,
    cost,
    needsDestination,
    isBlockade,
    recallEntry,
    regionHasActiveWrit,
    directivesRemaining,
    pledgeAvailable,
    bonusLightMult,
    bonusFullMult,
    bonusPayEligible,
    effectiveLevel,
    bonusMult,
    scaledCost,
    effectiveCost,
  };
}

// Refusal order is user-visible: drafting/selection blockers precede funding.
export function getCommissionDisabledReason(
  data: StewardData,
  draft: Pick<CommissionDraft, 'type' | 'region' | 'funding'> & {
    destination: string;
    inflight: boolean;
  },
  state: ReturnType<typeof deriveCommissionState>,
) {
  const { type, region, funding, destination, inflight } = draft;
  const {
    pledgeAvailable,
    scaledCost,
    directivesRemaining,
    isBlockade,
    regionHasActiveWrit,
    needsDestination,
  } = state;
  const fundingDisabledReason =
    funding === 'pledge' && !pledgeAvailable
      ? 'The Burgher Pledge is unavailable.'
      : funding === 'pledge' && data.pledge_balance < scaledCost
        ? `Insufficient Pledge (need ${coin(scaledCost)}, have ${coin(data.pledge_balance)}).`
        : funding === 'crown' && data.crown_purse_balance < scaledCost
          ? `Insufficient Crown's Purse (need ${coin(scaledCost)}, have ${coin(data.crown_purse_balance)}).`
          : funding === 'directive' && directivesRemaining <= 0
            ? "Today's directive quota is spent."
            : undefined;

  const disabledReason = inflight
    ? 'Drafting...'
    : !type
      ? 'Pick a commission type.'
      : !region
        ? isBlockade
          ? 'No blockade to clear.'
          : 'Pick a region.'
        : isBlockade && regionHasActiveWrit
          ? 'A writ is already in circulation for this blockade.'
          : needsDestination && !destination
            ? 'Pick the shipment destination.'
            : fundingDisabledReason;

  return disabledReason;
}
