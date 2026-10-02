import { useState } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../../backend';
import { InnkeeperRumorPanel } from '../ContractLedgerInnkeeper';
import { StewardDefensePanel } from '../ContractLedgerSteward';
import { TownerPostingPanel } from '../ContractLedgerTowner';
import { estimateContractReward } from './rewardEstimate';

export type Contract = {
  ref: string;
  title: string;
  type: string;
  difficulty: string;
  reward: number;
  deposit: number;
  deposit_return: number;
  area: string;
  region: string;
  objective: string;
  expected_count: number;
  threat_bands: number;
  levy_exempt: BooleanLike;
  guild_cut_exempt: BooleanLike;
  is_rumor: BooleanLike;
  is_defense: BooleanLike;
  is_towner: BooleanLike;
  is_standing: BooleanLike;
  required_fellowship_size: number;
  lapse_minutes: number;
};

type ActiveContract = {
  ref: string;
  title: string;
  type: string;
  difficulty: string;
  area: string;
  region: string;
  progress_current: number;
  progress_required: number;
  complete: BooleanLike;
};

export type ContractLedgerData = {
  is_handler: BooleanLike;
  balance: number;
  has_account: BooleanLike;
  active_count: number;
  active_max: number;
  active_max_base: number;
  active_fellowship_bonus: number;
  take_cooldown_remaining: number;
  user_fellowship_size: number;
  pool: Contract[];
  active: ActiveContract[];
  regions: string[];
  tax_rate: number;
  guild_cut_rate: number;
  can_proxy_turnin: BooleanLike;
  dynamic_role: string | null;
  dynamic_roles?: string[];
  rumor_points?: number;
  rumor_costs?: Record<string, number>;
  rumor_regions_by_type?: Record<string, string[]>;
  rumor_destinations?: string[];
};

const ALL_REGIONS = 'All';
const ALL_DIFFICULTIES = 'All';
const STANDING_FILTER = 'Standing';
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const FILTER_BUTTONS = [ALL_DIFFICULTIES, STANDING_FILTER, ...DIFFICULTIES];

type LedgerMode = { kind: 'contracts' } | { kind: 'dynamic'; role: string };

const DYNAMIC_TAB_LABELS: Record<string, string> = {
  innkeeper: 'Rumors',
  steward: 'Commissions',
  towner: 'Postings',
};

const renderDynamicPanel = (role: string) => {
  switch (role) {
    case 'innkeeper':
      return <InnkeeperRumorPanel />;
    case 'steward':
      return <StewardDefensePanel />;
    case 'towner':
      return <TownerPostingPanel />;
    default:
      return null;
  }
};

export const ContractLedgerContent = () => {
  const { data } = useBackend<ContractLedgerData>();
  const [mode, setMode] = useState<LedgerMode>({ kind: 'contracts' });
  const [activeRegion, setActiveRegion] = useState<string>(ALL_REGIONS);
  const [activeDifficulty, setActiveDifficulty] =
    useState<string>(ALL_DIFFICULTIES);

  const dynamicRoles =
    data.dynamic_roles ?? (data.dynamic_role ? [data.dynamic_role] : []);
  const activeDynamicRole =
    mode.kind === 'dynamic' && dynamicRoles.includes(mode.role)
      ? mode.role
      : null;
  const showingDynamic = activeDynamicRole !== null;

  const matchesRegion = (c: Contract) =>
    activeRegion === ALL_REGIONS || c.region === activeRegion;
  const matchesDifficulty = (c: Contract) => {
    if (activeDifficulty === ALL_DIFFICULTIES) return true;
    if (activeDifficulty === STANDING_FILTER) return !!c.is_standing;
    return c.difficulty === activeDifficulty;
  };

  const filtered = data.pool
    .filter((c) => matchesRegion(c) && matchesDifficulty(c))
    .sort((a, b) => {
      const sa = a.is_standing ? 0 : 1;
      const sb = b.is_standing ? 0 : 1;
      return sa - sb;
    });

  const regionTabs = [ALL_REGIONS, ...(data.regions || [])];

  return (
    <div className="ContractLedger">
      <div className="ContractLedger__Header">
        <h1>Grand Contract Ledger</h1>
      </div>
      <nav className="ContractLedger__TabBar" aria-label="Ledger services">
        <button
          type="button"
          className="ContractLedger__Tab"
          aria-pressed={!showingDynamic}
          onClick={() => setMode({ kind: 'contracts' })}
        >
          Contracts
        </button>
        {dynamicRoles.map((role) => (
          <button
            key={role}
            type="button"
            className="ContractLedger__Tab"
            aria-pressed={activeDynamicRole === role}
            onClick={() => setMode({ kind: 'dynamic', role })}
          >
            {DYNAMIC_TAB_LABELS[role] || role}
          </button>
        ))}
      </nav>
      {!showingDynamic && (
        <div className="ContractLedger__TabBar">
          {regionTabs.map((region) => {
            const count = data.pool.filter(
              (c) => region === ALL_REGIONS || c.region === region,
            ).length;
            const isActive = region === activeRegion;
            return (
              <button
                type="button"
                key={region}
                aria-pressed={isActive}
                className={
                  'ContractLedger__Tab' +
                  (isActive ? ' ContractLedger__Tab--active' : '')
                }
                onClick={() => setActiveRegion(region)}
              >
                {region} ({count})
              </button>
            );
          })}
        </div>
      )}

      {!showingDynamic && (
        <div className="ContractLedger__FilterBar">
          {FILTER_BUTTONS.map((diff) => {
            const isActive = diff === activeDifficulty;
            const count = data.pool.filter((c) => {
              if (!matchesRegion(c)) return false;
              if (diff === ALL_DIFFICULTIES) return true;
              if (diff === STANDING_FILTER) return !!c.is_standing;
              return c.difficulty === diff;
            }).length;
            return (
              <button
                type="button"
                key={diff}
                className="ContractLedger__Tab"
                aria-pressed={isActive}
                onClick={() => setActiveDifficulty(diff)}
              >
                {diff} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="ContractLedger__Board">
        {showingDynamic && activeDynamicRole ? (
          renderDynamicPanel(activeDynamicRole)
        ) : filtered.length === 0 ? (
          <div className="ContractLedger__Empty">
            No contracts match this filter. Broaden your search or return later.
          </div>
        ) : (
          <div className="ContractLedger__Grid">
            {filtered.map((c) => (
              <ContractCard key={c.ref} contract={c} />
            ))}
          </div>
        )}
      </div>

      <ActiveStrip
        active={data.active}
        activeMax={data.active_max}
        balance={data.balance}
      />
    </div>
  );
};

const ContractCard = (props: { contract: Contract }) => {
  const { act, data } = useBackend<ContractLedgerData>();
  const c = props.contract;
  const noAccount = !data.has_account;
  const takeCooldown = data.take_cooldown_remaining || 0;
  const atCap = data.active_count >= data.active_max;
  const cantAfford = data.balance < c.deposit;
  const fellowshipShort =
    c.required_fellowship_size > 0 &&
    (data.user_fellowship_size || 0) < c.required_fellowship_size;
  const disabled =
    noAccount || takeCooldown > 0 || atCap || cantAfford || fellowshipShort;
  const title = noAccount
    ? 'No bank account. Register with a Nervelock first.'
    : takeCooldown > 0
      ? `Guild cooldown, wait ${takeCooldown}s before signing another.`
      : atCap
        ? `You already hold ${data.active_max} contracts.`
        : cantAfford
          ? `Requires ${c.deposit} mammon in your account.`
          : fellowshipShort
            ? `Requires a Fellowship of ${c.required_fellowship_size}, you have ${data.user_fellowship_size || 0}.`
            : undefined;
  const estimate = estimateContractReward({
    reward: c.reward,
    deposit: c.deposit_return,
    levyRate: data.tax_rate,
    guildRate: data.guild_cut_rate || 0,
    levyExempt: !!c.levy_exempt,
    guildExempt: !!c.guild_cut_exempt,
  });
  return (
    <article className="ContractLedger__Card">
      <div className="ContractLedger__ContractRow">
        <div className="ContractLedger__Identity">
          <strong className="ContractLedger__CardTitle">{c.title}</strong>
          <div className="ContractLedger__Meta">
            {c.area || c.region || 'Unknown'} · {c.type} · {c.difficulty}
            {!!c.is_standing && ' · Standing'}
            {!!c.is_rumor && ' · Rumored'}
            {!!c.is_defense && ' · Commissioned'}
            {!!c.levy_exempt && ' · Levy exempt'}
            {!!c.guild_cut_exempt && ' · Guild exempt'}
          </div>
          {c.required_fellowship_size > 0 && (
            <div
              className={
                fellowshipShort
                  ? 'ContractLedger__Warning'
                  : 'ContractLedger__Meta'
              }
            >
              Fellowship {data.user_fellowship_size || 0} /{' '}
              {c.required_fellowship_size}
              {fellowshipShort ? ' (short)' : ''}
            </div>
          )}
        </div>
        <div className="ContractLedger__Money">
          <span>Estimated earnings</span>
          <b>{estimate.earnings}m</b>
        </div>
        <div className="ContractLedger__Money">
          <span>Deposit to sign</span>
          <b>{c.deposit}m</b>
        </div>
        <button
          type="button"
          className="ContractLedger__SignButton"
          disabled={disabled}
          title={title}
          onClick={() => act('sign', { ref: c.ref })}
        >
          Sign
        </button>
      </div>
      <details className="ContractLedger__Details">
        <summary>
          Objectives &amp; payment · lapses{' '}
          {c.lapse_minutes > 0 ? `~${c.lapse_minutes}m` : '<1m'}
        </summary>
        {c.objective && (
          <p className="ContractLedger__CardObjective">{c.objective}</p>
        )}
        {c.expected_count > 0 && <p>Expected count: {c.expected_count}</p>}
        {c.threat_bands > 0 && (
          <p>
            Clears {c.threat_bands} band{c.threat_bands === 1 ? '' : 's'} of
            threat.
          </p>
        )}
        <dl className="ContractLedger__Payment">
          <dt>Posted reward</dt>
          <dd>{c.reward}m</dd>
          <dt>
            Crown levy (
            {c.levy_exempt ? 'exempt' : `${Math.round(data.tax_rate * 100)}%`})
          </dt>
          <dd>-{estimate.levy}m</dd>
          <dt>
            Guild cut (
            {c.guild_cut_exempt
              ? 'exempt'
              : `${Math.round((data.guild_cut_rate || 0) * 100)}%`}
            , reward + deposit)
          </dt>
          <dd>-{estimate.guild}m</dd>
          <dt>Estimated earnings</dt>
          <dd>{estimate.earnings}m</dd>
          <dt>Returned deposit on completion</dt>
          <dd>{estimate.deposit}m</dd>
          <dt>Estimated total payment</dt>
          <dd>{estimate.total}m</dd>
        </dl>
        <p className="ContractLedger__Meta">
          Estimate at current posted rates. Recipient charters and carried tax
          may alter payment.
        </p>
      </details>
    </article>
  );
};

const ActiveStrip = (props: {
  active: ActiveContract[];
  activeMax: number;
  balance: number;
}) => {
  const { act, data } = useBackend<ContractLedgerData>();
  const takeCooldown = data.take_cooldown_remaining || 0;
  const blockReason = !data.has_account
    ? 'You have no bank account. Register with a Nervelock before signing any contract.'
    : takeCooldown > 0
      ? `Guild cooldown active, wait ${takeCooldown}s before signing another contract.`
      : null;
  const fellowshipBonus = data.active_fellowship_bonus || 0;
  const fellowshipNote =
    fellowshipBonus > 0
      ? `+${fellowshipBonus} from leading your Fellowship`
      : 'Form a Fellowship for more contract slots.';
  return (
    <div className="ContractLedger__ActiveStrip">
      <div className="ContractLedger__ActiveStripHeader">
        <span>
          Your Contracts ({props.active.length} / {props.activeMax})
          <span
            style={{
              marginLeft: '10px',
              fontSize: '0.85em',
              color:
                fellowshipBonus > 0
                  ? 'var(--p-seal-green)'
                  : 'var(--p-ink-soft)',
              fontWeight: 'normal',
            }}
          >
            {fellowshipNote}
          </span>
        </span>
        <span>Nervelock Balance: {props.balance} Mammons</span>
      </div>
      {!!data.can_proxy_turnin && (
        <div
          style={{
            fontSize: '0.85em',
            fontStyle: 'italic',
            color: 'var(--p-ink-soft)',
            marginBottom: '4px',
          }}
        >
          You may turn in any completed contract here on its holder&apos;s
          behalf - the reward is credited to the holder, and you take no cut.
        </div>
      )}
      <details className="ContractLedger__Details">
        <summary>Fellowship benefits</summary>
        <p>Open the IC tab to form a fellowship and invite people nearby.</p>
        <p>
          Lead a fellowship of 2+ for more contract slots (+1 at 2 members, +2
          at 3+).
        </p>
        <p>
          Fellowship members may turn in each other&apos;s contracts. It is
          credited to the one turning it in, using their tax exemption status,
          if any.
        </p>
      </details>
      {blockReason && (
        <div
          className="ContractLedger__ActiveRow"
          style={{ color: 'var(--p-seal-red)', fontWeight: 'bold' }}
        >
          {blockReason}
        </div>
      )}
      {props.active.length === 0 ? (
        <div className="ContractLedger__ActiveRow">
          <span className="ContractLedger__ActiveRow__Meta">
            You hold no active contracts.
          </span>
        </div>
      ) : (
        props.active.map((a) => (
          <div key={a.ref} className="ContractLedger__ActiveRow">
            <span className="ContractLedger__ActiveRow__Title">{a.title}</span>
            <span className="ContractLedger__ActiveRow__Meta">
              {a.type} &middot; {a.difficulty} &middot;{' '}
              {a.region || a.area || 'Unknown'}
              {a.progress_required > 1 &&
                ` - ${a.progress_current}/${a.progress_required}`}
              {!!a.complete && ' - ready to turn in'}
            </span>
            {!a.complete && (
              <button
                type="button"
                className="ContractLedger__Warning"
                title="Forfeit deposit and void the contract."
                onClick={() => act('abandon', { ref: a.ref })}
              >
                Abandon
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};
