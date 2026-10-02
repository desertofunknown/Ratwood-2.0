import { estimateContractReward } from '../ContractLedger/rewardEstimate';

type RewardTerms = {
  reward: number;
  deposit: number;
  levyRate: number;
  levyExempt: boolean;
  guildCutRate: number;
};

const estimateReward = (terms: RewardTerms) =>
  estimateContractReward({
    ...terms,
    guildRate: terms.guildCutRate,
    guildExempt: false,
  });

export const RewardClause = (props: RewardTerms) => {
  const estimate = estimateReward(props);
  return (
    <>
      <b>{props.reward} mammon</b> (estimated earnings:{' '}
      <b>{estimate.earnings} mammon</b>
      {props.deposit > 0 && (
        <>
          ; plus <b>{props.deposit} mammon</b> deposit return
        </>
      )}
      )
    </>
  );
};

export const PaymentTerms = (props: RewardTerms) => {
  const { deposit, levyRate, levyExempt, guildCutRate } = props;
  const estimate = estimateReward(props);
  return (
    <details
      style={{
        marginTop: 12,
        paddingTop: 8,
        borderTop: '1px solid var(--p-ink-faint)',
      }}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
        Payment terms
      </summary>
      {!levyExempt && levyRate > 0 && (
        <p>Crown&apos;s Levy: {estimate.levy} mammon</p>
      )}
      {guildCutRate > 0 && (
        <p>
          Guild&apos;s cut: {estimate.guild} mammon on bounty
          {deposit > 0 && ' and deposit'}
        </p>
      )}
      {deposit > 0 && (
        <p>
          Returned deposit, separate from earnings: <b>{deposit} mammon</b>
        </p>
      )}
      <p>
        Estimated total payment: <b>{estimate.total} mammon</b>
      </p>
      <p>
        Current posted rates; recipient charter rights and carried tax may alter
        payment.
      </p>
    </details>
  );
};
