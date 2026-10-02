import { useState } from 'react';

import { type FundEntry, type TabProps } from '../types';

type LoanTier = 'personal' | 'indenture';
const TERM_OPTIONS = [1, 2, 3];
const RATE_OPTIONS = [10, 15, 20, 25, 50];

export const IssueLoanSection = ({ fund, data, act }: TabProps & { fund: FundEntry }) => {
  const [tier, setTier] = useState<LoanTier>('personal');
  const [amount, setAmount] = useState<string>('');
  const [term, setTerm] = useState<number>(2);
  const [rate, setRate] = useState<number>(25);
  const rateOptions = fund.allow_zero_rate ? [0, ...RATE_OPTIONS] : RATE_OPTIONS;
  const activeRate = rateOptions.includes(rate) ? rate : 25;
  const indentureTargets = data.funds.filter((f) => f.id !== fund.id && f.supports_loans);
  const [target, setTarget] = useState<string>(indentureTargets[0]?.id ?? '');
  const activeTarget = indentureTargets.find((f) => f.id === target) ?? indentureTargets[0];
  const numeric = Number(amount);
  const minimum = tier === 'personal' ? 50 : 501;
  const maximum = tier === 'personal' ? 500 : 2000;
  const pastWindow = data.day > data.max_issuance_day;
  const balance = data.fund_balances[fund.id]?.balance ?? 0;
  const disabled = pastWindow || !Number.isInteger(numeric) || numeric < minimum ||
    numeric > maximum || numeric > balance || (tier === 'indenture' && !activeTarget);

  return (
    <section className="MeisterPanel__section">
      <div className="MeisterPanel__sectionTitle"><h2>Draft a loan</h2></div>
      {pastWindow && <p className="MeisterPanel__help">New loans may not be drawn after day {data.max_issuance_day}.</p>}
      <div className="MeisterPanel__choices" role="group" aria-label="Loan type">
        <button type="button" aria-pressed={tier === 'personal'} onClick={() => setTier('personal')}>Personal</button>
        <button type="button" aria-pressed={tier === 'indenture'} onClick={() => setTier('indenture')}>Indenture</button>
      </div>
      {tier === 'indenture' && (
        <>
          <p className="MeisterPanel__help">Indentures are publicly proclaimed upon acceptance and upon default. The whole realm will hear.</p>
          <div className="MeisterPanel__formRow">
            <span>Target</span>
            <div className="MeisterPanel__choices" role="group" aria-label="Indenture target">
              {indentureTargets.map((entry) => (
                <button type="button" key={entry.id} aria-pressed={activeTarget?.id === entry.id} onClick={() => setTarget(entry.id)}>
                  {entry.label}
                </button>
              ))}
              {!indentureTargets.length && <span>No target institutions available.</span>}
            </div>
          </div>
        </>
      )}
      <div className="MeisterPanel__actions">
        <label>
          Principal
          <input type="number" min={minimum} max={maximum} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <span className="MeisterPanel__muted">{minimum}–{maximum}m</span>
      </div>
      {numeric > balance && <p className="MeisterPanel__warning">The coffers cannot cover this principal.</p>}
      <div className="MeisterPanel__formRow">
        <span>Term</span>
        <div className="MeisterPanel__choices" role="group" aria-label="Loan term">
          {TERM_OPTIONS.map((value) => (
            <button type="button" key={value} aria-pressed={term === value} onClick={() => setTerm(value)}>
              {value} day{value > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="MeisterPanel__formRow">
        <span>Daily rate</span>
        <div className="MeisterPanel__choices" role="group" aria-label="Daily interest rate">
          {rateOptions.map((value) => (
            <button type="button" key={value} aria-pressed={activeRate === value} onClick={() => setRate(value)}>{value}%</button>
          ))}
        </div>
      </div>
      <div className="MeisterPanel__actions MeisterPanel__actions--end">
        <button type="button" disabled={disabled} onClick={() => {
          act(tier === 'personal' ? 'issue_personal' : 'issue_indenture', {
            fund_id: fund.id, amount: numeric, term, rate: activeRate,
            target: tier === 'indenture' ? activeTarget?.id : undefined,
          });
          setAmount('');
        }}>
          Stamp writ
        </button>
      </div>
    </section>
  );
};
