import { useState } from 'react';

import { type FundEntry, type TabProps } from '../types';

export const WithdrawSection = ({ fund, balance, act }: {
  fund: FundEntry;
  balance: number;
  act: TabProps['act'];
}) => {
  const [amount, setAmount] = useState<string>('');
  const numeric = Number(amount);
  const disabled = !Number.isInteger(numeric) || numeric <= 0 || numeric > balance;

  return (
    <section className="MeisterPanel__section">
      <div className="MeisterPanel__sectionTitle"><h2>Direct withdrawal</h2><span>Up to {balance}m</span></div>
      <div className="MeisterPanel__actions">
        <label>
          Withdraw mammon
          <input type="number" min={1} max={balance} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="button" disabled={disabled} onClick={() => {
          act('withdraw_institutional', { fund_id: fund.id, amount: numeric });
          setAmount('');
        }}>
          Draw coin
        </button>
      </div>
      {!!fund.withdraw_rule && <p className="MeisterPanel__help">{fund.withdraw_rule}</p>}
    </section>
  );
};
