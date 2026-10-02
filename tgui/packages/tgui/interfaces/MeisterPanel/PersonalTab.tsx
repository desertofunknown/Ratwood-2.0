import { useState } from 'react';

import { type TabProps } from './types';

const DENOMS = [
  { id: 'GOLD', label: 'Gold', value: 10 },
  { id: 'SILVER', label: 'Silver', value: 5 },
  { id: 'BRONZE', label: 'Bronze', value: 1 },
];

export const PersonalTab = ({ data, act }: TabProps) => {
  const [denom, setDenom] = useState<string>('GOLD');
  const [coinAmount, setCoinAmount] = useState<string>('');
  const [repayAmount, setRepayAmount] = useState<string>('');
  const numericCoins = Number(coinAmount) || 0;
  const denomMod = DENOMS.find((d) => d.id === denom)?.value ?? 1;
  const totalDraw = numericCoins * denomMod;
  const drawDisabled =
    !Number.isInteger(numericCoins) || numericCoins < 1 || numericCoins > 20 || totalDraw > data.account_balance;
  const numericRepay = Number(repayAmount) || 0;
  const loan = data.active_loan;
  const repayDisabled =
    !loan || !Number.isInteger(numericRepay) || numericRepay < 1 ||
    numericRepay > Math.min(loan.remaining, data.account_balance);

  return (
    <>
      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle">
          <h2>Withdraw coin</h2>
          <span>20 coins maximum</span>
        </div>
        <div className="MeisterPanel__denominations" role="group" aria-label="Coin denomination">
          {DENOMS.map((d) => (
            <button
              type="button"
              key={d.id}
              aria-pressed={denom === d.id}
              onClick={() => setDenom(d.id)}
            >
              {d.label} <span>{d.value}m</span>
            </button>
          ))}
        </div>
        <div className="MeisterPanel__withdrawal">
          <label>
            Coins
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={coinAmount}
              placeholder="1–20"
              onChange={(e) => setCoinAmount(e.target.value)}
            />
          </label>
          <div className="MeisterPanel__total">
            <span>Total</span>
            <strong>{Number.isInteger(numericCoins) && numericCoins >= 0 ? `${totalDraw}m` : '—'}</strong>
          </div>
          <button
            type="button"
            className="MeisterPanel__primary"
            disabled={drawDisabled}
            onClick={() => {
              act('withdraw_personal', { denomination: denom, amount: numericCoins });
              setCoinAmount('');
            }}
          >
            Draw coin
          </button>
        </div>
        <p className="MeisterPanel__help">
          {data.account_balance === 0
            ? 'Account empty. Insert coins to deposit.'
            : coinAmount && (!Number.isInteger(numericCoins) || numericCoins < 1 || numericCoins > 20)
              ? 'Enter a whole number from 1 to 20 coins.'
            : totalDraw > data.account_balance
              ? 'This withdrawal exceeds your available balance.'
              : 'Insert coins to deposit.'}
        </p>
      </section>

      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle">
          <h2>Active loan</h2>
          {!!loan && <span>{loan.creditor}</span>}
        </div>
        {!loan && (
          <p className="MeisterPanel__empty">No outstanding loan.</p>
        )}
        {!!loan && (
          <>
            <dl className="MeisterPanel__entries">
              <div><dt>Remaining debt</dt><dd>{loan.remaining}m</dd></div>
              <div><dt>Original principal</dt><dd>{loan.principal}m</dd></div>
              <div><dt>Daily interest</dt><dd>{loan.interest_pct}%</dd></div>
            </dl>
            <p className={loan.defaulted ? 'MeisterPanel__warning' : 'MeisterPanel__help'}>
              {loan.defaulted
                ? `Defaulted on day ${loan.due_on_day}`
                : `Due day ${loan.due_on_day} (${loan.days_until_due} day${loan.days_until_due === 1 ? '' : 's'} remaining)`}
            </p>
            <div className="MeisterPanel__actions">
              <label>
                Repayment in mammon
                <input
                  type="number"
                  min={1}
                  max={Math.min(loan.remaining, data.account_balance)}
                  step={1}
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={repayDisabled}
                onClick={() => {
                  act('repay_loan', { amount: numericRepay });
                  setRepayAmount('');
                }}
              >
                Repay loan
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
};
