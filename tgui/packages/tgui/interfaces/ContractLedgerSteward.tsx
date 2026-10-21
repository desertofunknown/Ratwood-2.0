import { type ReactNode, useState } from 'react';

import { useBackend } from '../backend';
import {
  coin,
  deriveCommissionState,
  getCommissionDisabledReason,
  RECOVERY_TYPE,
} from './ContractLedgerSteward/commissionState';
import type {
  DefenseLogEntry,
  FundingSource,
  StewardData,
} from './ContractLedgerSteward/types';

type SubTab = 'compose' | 'history';
const DISPATCH_DEBOUNCE_MS = 500;

const COMMISSION_LABELS: Record<string, string> = {
  'Blockade Defense': 'Clear Blockade',
};

// Formats a multiplier delta as a rounded percentage.
const formatMultiplierDelta = (delta: number): string => {
  const pct = Math.round(delta * 100);
  return `${pct}%`;
};

// Turns a region's TP multiplier into a short flavor line. Returns null for baseline
// (mult=1) so the UI doesn't clutter itself with "nothing special" chrome.
const regionRewardFlavor = (
  regionName: string,
  mult: number | undefined,
): string | null => {
  if (typeof mult !== 'number' || mult === 1) return null;
  if (mult > 1) {
    const descriptor = mult >= 1.4 ? 'bleak' : 'dangerous';
    return `${regionName} is a ${descriptor} region - contracts from that region tend to be ${formatMultiplierDelta(mult - 1)} more lucrative.`;
  }
  return `${regionName} is a settled region - contracts from that region tend to be ${formatMultiplierDelta(1 - mult)} less lucrative.`;
};

const FormRow = (props: { label: string; children: ReactNode }) => (
  <div className="ContractLedger__InnkeeperFormRow">
    <label className="ContractLedger__InnkeeperLabel">{props.label}</label>
    {props.children}
  </div>
);

const BonusPayOption = (props: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
}) => (
  <button
    type="button"
    onClick={props.onClick}
    style={{
      padding: '3px 10px',
      border: `1px solid ${props.active ? 'var(--p-bg-shadow)' : 'var(--p-ink-soft)'}`,
      background: props.active ? 'var(--p-tab-active-bg)' : 'transparent',
      color: props.active ? 'var(--p-ink)' : 'var(--p-ink-soft)',
      fontWeight: props.active ? 'bold' : 'normal',
      cursor: 'pointer',
      borderRadius: '2px',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: '60px',
    }}
  >
    <span>{props.label}</span>
    <span style={{ fontSize: '10px', color: 'var(--p-ink-soft)' }}>
      {props.sublabel}
    </span>
  </button>
);

const Select = (props: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
}) => (
  <select
    className="ContractLedger__InnkeeperSelect"
    value={props.value}
    onChange={(e) => props.onChange(e.target.value)}
    disabled={props.disabled}
  >
    <option value="">
      {props.disabled && props.disabledPlaceholder
        ? props.disabledPlaceholder
        : props.placeholder}
    </option>
    {props.options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

const SubTabBar = (props: {
  active: SubTab;
  onSelect: (t: SubTab) => void;
  historyCount: number;
}) => {
  const tabs: { id: SubTab; label: string }[] = [
    { id: 'compose', label: 'Commission' },
    { id: 'history', label: `History (${props.historyCount})` },
  ];
  return (
    <div className="ContractLedger__InnkeeperSubTabBar">
      {tabs.map((t) => (
        <button
          type="button"
          key={t.id}
          aria-pressed={t.id === props.active}
          className={
            'ContractLedger__InnkeeperSubTab' +
            (t.id === props.active
              ? ' ContractLedger__InnkeeperSubTab--active'
              : '')
          }
          onClick={() => props.onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

const HistoryView = (props: { log: DefenseLogEntry[] }) => {
  if (!props.log.length) {
    return (
      <div className="ContractLedger__InnkeeperEmpty">
        No commissions have been drawn against the Pledge this week.
      </div>
    );
  }
  const rows = [...props.log].reverse();
  return (
    <div className="ContractLedger__InnkeeperHistory">
      {rows.map((r, i) => (
        <div key={i} className="ContractLedger__InnkeeperHistoryRow">
          <span className="ContractLedger__InnkeeperHistoryTitle">
            {r.title}
          </span>
          <span className="ContractLedger__InnkeeperHistoryMeta">
            {r.type} &middot; {r.region} &middot; day {r.day} &middot;{' '}
            {coin(r.cost)}
          </span>
        </div>
      ))}
    </div>
  );
};

type DispatchMode = 'board' | 'hands';

const ModeRadio = (props: {
  value: DispatchMode;
  selected: DispatchMode;
  onChange: (v: DispatchMode) => void;
  label: string;
}) => (
  <label>
    <input
      type="radio"
      name="defenseMode"
      checked={props.selected === props.value}
      onChange={() => props.onChange(props.value)}
    />
    &nbsp;{props.label}
  </label>
);

const LevyStampRow = (props: {
  aldermanActing: boolean;
  levyExempt: boolean;
  onChange: (v: boolean) => void;
}) => (
  <FormRow label="Levy Stamp">
    <label
      style={
        props.aldermanActing
          ? { textDecoration: 'line-through', color: 'var(--p-ink-soft)' }
          : undefined
      }
      title={
        props.aldermanActing
          ? "The Alderman cannot waive the Crown's tax."
          : undefined
      }
    >
      <input
        type="checkbox"
        checked={props.levyExempt}
        disabled={props.aldermanActing}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      &nbsp;Stamp as LEVY EXEMPT (waive Crown&apos;s Contract Levy)
    </label>
  </FormRow>
);

const ComposeView = () => {
  const { act, data } = useBackend<StewardData>();

  const typeOptions = Object.keys(data.defense_costs || {});
  const [type, setType] = useState<string>(typeOptions[0] || '');
  const [region, setRegion] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [mode, setMode] = useState<DispatchMode>('board');
  const [levyExempt, setLevyExempt] = useState<boolean>(false);
  // 0 = none, 1 = light (1.25x), 2 = full (1.5x). Matches COMMISSION_BONUS_PAY_* defines.
  const [bonusPayLevel, setBonusPayLevel] = useState<0 | 1 | 2>(0);
  const [funding, setFunding] = useState<FundingSource>('pledge');
  const [inflight, setInflight] = useState<boolean>(false);

  const commissionState = deriveCommissionState(data, {
    type,
    region,
    funding,
    bonusPayLevel,
  });
  const {
    aldermanActing,
    regionsForType,
    needsDestination,
    isBlockade,
    recallEntry,
    directivesRemaining,
    pledgeAvailable,
    bonusLightMult,
    bonusFullMult,
    bonusPayEligible,
    effectiveLevel,
    effectiveCost,
  } = commissionState;

  // If the currently-selected funding disappears (pledge repealed, quota spent), fall back.
  if (funding === 'pledge' && !pledgeAvailable && !aldermanActing) {
    setFunding('crown');
  }
  if (funding === 'directive' && directivesRemaining <= 0) {
    setFunding(pledgeAvailable ? 'pledge' : 'crown');
  }
  // Aldermen are restricted to the Pledge - if they wandered onto another source via stale state,
  // snap them back. Server enforces this independently; the UI just keeps the state coherent.
  if (aldermanActing && funding !== 'pledge') {
    setFunding('pledge');
  }
  if (aldermanActing && levyExempt) {
    setLevyExempt(false);
  }

  const onTypeChange = (next: string) => {
    setType(next);
    const newRegions = data.defense_regions_by_type?.[next] || [];
    if (!newRegions.includes(region)) setRegion('');
    if (next !== RECOVERY_TYPE) setDestination('');
  };

  const disabledReason = getCommissionDisabledReason(
    data,
    { funding, inflight, type, region, destination },
    commissionState,
  );

  const dispatch = () => {
    if (disabledReason) return;
    setInflight(true);
    const isDirective = funding === 'directive';
    act('commission_defense', {
      type,
      region,
      destination: needsDestination ? destination : null,
      // Blockade + directive writs are always bearer-bond; ignore the mode control.
      in_hands: isBlockade || isDirective ? 1 : mode === 'hands' ? 1 : 0,
      // Directives skip the levy-exempt stamp (no reward to exempt).
      levy_exempt: isDirective ? 0 : levyExempt ? 1 : 0,
      // Bonus Pay forced off for Requests (directive) server-side as well.
      bonus_pay_level: effectiveLevel,
      funding,
    });
    setTimeout(() => setInflight(false), DISPATCH_DEBOUNCE_MS);
  };

  return (
    <>
      <div className="ContractLedger__InnkeeperFlavor">
        Commission adventurers against the Realm's enemies.
      </div>

      <FormRow label="Commission Type">
        <select
          className="ContractLedger__InnkeeperSelect"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {COMMISSION_LABELS[t] || t} ({coin(data.defense_costs[t])})
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label={isBlockade ? 'Blockaded Region' : 'Region'}>
        <select
          className="ContractLedger__InnkeeperSelect"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          disabled={regionsForType.length === 0}
        >
          <option value="">
            {regionsForType.length === 0
              ? isBlockade
                ? 'No blockades are active.'
                : 'No region will host this type'
              : isBlockade
                ? '- pick a blockade -'
                : '- pick a region -'}
          </option>
          {regionsForType.map((r) => {
            const mult = data.region_tp_multipliers?.[r];
            // Only annotate non-blockade regions - blockade rows route through economic
            // regions, which don't carry a TP multiplier.
            const suffix =
              !isBlockade && typeof mult === 'number' && mult !== 1
                ? ` (×${mult} reward)`
                : '';
            const label = isBlockade
              ? data.blockade_region_labels?.[r] || r
              : r;
            return (
              <option key={r} value={r}>
                {label}
                {suffix}
              </option>
            );
          })}
        </select>
      </FormRow>

      {!isBlockade &&
        region &&
        (() => {
          const flavor = regionRewardFlavor(
            region,
            data.region_tp_multipliers?.[region],
          );
          if (!flavor) return null;
          return (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--p-ink-soft)',
                padding: '2px 0 6px 0',
                marginLeft: '6px',
              }}
            >
              {flavor}
            </div>
          );
        })()}

      {needsDestination && (
        <FormRow label="Shipment Destination">
          <Select
            value={destination}
            onChange={setDestination}
            options={data.defense_destinations || []}
            placeholder="- pick a destination -"
          />
        </FormRow>
      )}

      <FormRow label="Fund">
        <div className="ContractLedger__InnkeeperModeRow">
          <label>
            <input
              type="radio"
              name="fundingSource"
              checked={funding === 'pledge'}
              disabled={!pledgeAvailable}
              onChange={() => setFunding('pledge')}
            />
            &nbsp;Burgher Pledge ({coin(data.pledge_balance)})
          </label>
          <label
            style={
              aldermanActing
                ? { textDecoration: 'line-through', color: 'var(--p-ink-soft)' }
                : undefined
            }
            title={
              aldermanActing
                ? "The Alderman commissions only against the Commons' Pledge."
                : undefined
            }
          >
            <input
              type="radio"
              name="fundingSource"
              checked={funding === 'crown'}
              disabled={aldermanActing}
              onChange={() => setFunding('crown')}
            />
            &nbsp;Crown's Purse ({coin(data.crown_purse_balance)})
          </label>
          <label
            style={
              aldermanActing
                ? { textDecoration: 'line-through', color: 'var(--p-ink-soft)' }
                : undefined
            }
            title={
              aldermanActing
                ? 'Requests are the Steward&apos;s prerogative, not the Alderman&apos;s.'
                : undefined
            }
          >
            <input
              type="radio"
              name="fundingSource"
              checked={funding === 'directive'}
              disabled={aldermanActing || directivesRemaining <= 0}
              onChange={() => setFunding('directive')}
            />
            &nbsp;Request ({directivesRemaining}/{data.directives_per_day ?? 0}{' '}
            left)
          </label>
        </div>
      </FormRow>

      {funding === 'directive' && (
        <div className="ContractLedger__InnkeeperFlavor">
          A Request calls upon someone to answer out of duty. No coin changes
          hands; the scroll is drawn to your hand and must be given directly to
          whoever will honour it.
        </div>
      )}

      {bonusPayEligible && (
        <FormRow label="Bonus Pay">
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <BonusPayOption
              active={bonusPayLevel === 0}
              onClick={() => setBonusPayLevel(0)}
              label="None"
              sublabel="x1.0"
            />
            <BonusPayOption
              active={bonusPayLevel === 1}
              onClick={() => setBonusPayLevel(1)}
              label="Light"
              sublabel={`x${bonusLightMult}`}
            />
            <BonusPayOption
              active={bonusPayLevel === 2}
              onClick={() => setBonusPayLevel(2)}
              label="Full"
              sublabel={`x${bonusFullMult}`}
            />
          </div>
        </FormRow>
      )}

      {!isBlockade && funding !== 'directive' && (
        <FormRow label="Deliver As">
          <div className="ContractLedger__InnkeeperModeRow">
            <ModeRadio
              value="board"
              selected={mode}
              onChange={setMode}
              label="Post on public board"
            />
            <ModeRadio
              value="hands"
              selected={mode}
              onChange={setMode}
              label="Put in my hands"
            />
          </div>
        </FormRow>
      )}

      {funding !== 'directive' && (
        <LevyStampRow
          aldermanActing={aldermanActing}
          levyExempt={levyExempt}
          onChange={setLevyExempt}
        />
      )}
      {isBlockade && funding !== 'directive' && (
        <div className="ContractLedger__InnkeeperFlavor">
          Blockade writs are always drawn to your hand. Pin to the Grand
          Contract Ledger to require a Fellowship of three; keep in hand to
          dispatch a trusted party directly. Each defender past the third who
          stands at the blockade, up to six, raises both the waves and the
          payout by 20%.
        </div>
      )}

      {isBlockade && recallEntry && (
        <div className="ContractLedger__InnkeeperFlavor">
          {recallEntry.recall_eligible
            ? `A writ is in circulation for ${recallEntry.region} and has gone unanswered. It can be recalled now${
                recallEntry.refund > 0 && recallEntry.refund_fund
                  ? ` (refunds ${coin(recallEntry.refund)} to ${recallEntry.refund_fund})`
                  : ''
              }.`
            : `A writ is in circulation for ${recallEntry.region}. It cannot be recalled: ${recallEntry.recall_blocker ?? 'unknown reason'}.`}
        </div>
      )}

      <div className="ContractLedger__InnkeeperFormFooter">
        <button
          type="button"
          className="ContractLedger__SignButton"
          disabled={!!disabledReason}
          title={disabledReason}
          onClick={dispatch}
        >
          {funding === 'directive'
            ? 'Submit Request'
            : isBlockade
              ? `Print Writ (${coin(effectiveCost)})`
              : `Commission (${coin(effectiveCost)})`}
        </button>
        {isBlockade && !!recallEntry?.recall_eligible && (
          <button
            type="button"
            className="ContractLedger__SignButton"
            onClick={() => act('recall_blockade_writ', { region })}
          >
            Recall Writ
            {recallEntry.refund > 0
              ? ` (refund ${coin(recallEntry.refund)})`
              : ''}
          </button>
        )}
      </div>
    </>
  );
};

export const StewardDefensePanel = () => {
  const { data } = useBackend<StewardData>();
  const [subTab, setSubTab] = useState<SubTab>('compose');

  const guildBonus = data.pledge_guild_bonus || 0;
  const baseDailyRefill =
    data.pledge_refill_base +
    data.pledge_refill_per_player * data.pledge_active_players;
  const dailyRefill = baseDailyRefill + guildBonus;

  return (
    <div className="ContractLedger__Innkeeper">
      <div className="ContractLedger__InnkeeperHeader">
        <div className="ContractLedger__InnkeeperTitle">
          By the Pledge of the Burghers&hellip;
        </div>
        <div className="ContractLedger__InnkeeperBalance">
          Burgher Pledge:&nbsp;<b>{coin(data.pledge_balance)}</b>
          <span className="ContractLedger__InnkeeperBalanceFormula">
            {' '}
            (+{coin(data.pledge_refill_base)} base, +
            {coin(data.pledge_refill_per_player)}/player &times;{' '}
            {data.pledge_active_players}
            {guildBonus > 0
              ? `, +${coin(guildBonus)} Guild of Arms tribute`
              : ''}{' '}
            = {coin(dailyRefill)}/day, cap {coin(2 * dailyRefill)})
          </span>
        </div>
        {!data.pledge_golden_active && (
          <div
            className="ContractLedger__InnkeeperBalanceFormula"
            style={{ color: 'var(--p-seal-amber)' }}
          >
            Golden Bull suspended - the Pledge does not refill.
          </div>
        )}
      </div>

      <SubTabBar
        active={subTab}
        onSelect={setSubTab}
        historyCount={(data.defense_log || []).length}
      />

      {subTab === 'compose' ? (
        <ComposeView />
      ) : (
        <HistoryView log={data.defense_log || []} />
      )}
    </div>
  );
};
