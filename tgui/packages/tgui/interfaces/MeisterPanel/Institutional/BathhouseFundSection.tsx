import { useState } from 'react';

import { type TabProps } from '../types';

export const BathhouseFundSection = ({ data, act }: TabProps) => {
  const [deposit, setDeposit] = useState<string>('');
  const depositNum = Number(deposit);
  const depositDisabled = !Number.isInteger(depositNum) || depositNum <= 0 || depositNum > data.account_balance;

  return (
    <>
      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>Employment terms</h2></div>
        <dl className="MeisterPanel__entries">
          <div><dt>Workers, per dae</dt><dd>{data.bathhouse_worker_withdraw_limit}m{!!data.bathhouse_worker_suspended && ' (suspended)'}</dd></div>
          <div><dt>Agents, per dae</dt><dd>{data.bathhouse_agent_withdraw_limit}m{!!data.bathhouse_agent_suspended && ' (suspended)'}</dd></div>
        </dl>
        {!data.is_bathmaster && (
          <p className="MeisterPanel__help">
            {data.bathhouse_viewer_suspended
              ? 'The Nightmistress has suspended your payments until she resumes them.'
              : `You have ${data.bathhouse_withdraw_remaining}m remaining this dae.`}
          </p>
        )}
      </section>
      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>Render coin</h2><span>Account: {data.account_balance}m</span></div>
        <div className="MeisterPanel__actions">
          <label>
            Deposit mammon
            <input type="number" min={1} max={data.account_balance} step={1} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </label>
          <button type="button" disabled={depositDisabled} onClick={() => {
            act('deposit_institutional', { fund_id: 'bathhouse', amount: depositNum });
            setDeposit('');
          }}>
            Render unto the Bathhouse
          </button>
        </div>
      </section>
      {!!data.is_bathmaster && (
        <section className="MeisterPanel__section">
          <div className="MeisterPanel__sectionTitle"><h2>Daily withdrawal limits</h2><span>Mammon per head, per dae</span></div>
          <GroupLimitControls key={`worker:${data.bathhouse_worker_withdraw_limit}`} label="Workers" group="worker" currentLimit={data.bathhouse_worker_withdraw_limit} suspended={!!data.bathhouse_worker_suspended} act={act} />
          <GroupLimitControls key={`agent:${data.bathhouse_agent_withdraw_limit}`} label="Agents" group="agent" currentLimit={data.bathhouse_agent_withdraw_limit} suspended={!!data.bathhouse_agent_suspended} act={act} />
        </section>
      )}
    </>
  );
};

const GroupLimitControls = ({ label, group, currentLimit, suspended, act }: {
  label: string;
  group: 'worker' | 'agent';
  currentLimit: number;
  suspended: boolean;
  act: TabProps['act'];
}) => {
  const [limit, setLimit] = useState(String(currentLimit));
  const numeric = Number(limit);
  const disabled = limit === '' || !Number.isInteger(numeric) || numeric < 0 || numeric > 10000;
  return (
    <div className="MeisterPanel__limitRow">
      <label>
        {label}
        <input type="number" min={0} max={10000} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <button type="button" aria-label={`Set ${group} limit`} disabled={disabled} onClick={() => act('set_bathhouse_limit', { group, amount: numeric })}>Set limit</button>
      <button type="button" aria-label={`${suspended ? 'Resume' : 'Suspend'} ${group} payments`} onClick={() => act('toggle_bathhouse_suspension', { group })}>
        {suspended ? 'Resume payments' : 'Suspend payments'}
      </button>
    </div>
  );
};
