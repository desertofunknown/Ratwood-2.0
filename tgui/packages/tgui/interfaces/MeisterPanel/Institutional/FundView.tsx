import { type FundEntry, type TabProps } from '../types';
import { BathhouseFundSection } from './BathhouseFundSection';
import { BathhouseOrdinanceSection } from './BathhouseOrdinanceSection';
import { FundActivity } from './FundActivity';
import { IssueLoanSection } from './IssueLoanSection';
import { WithdrawSection } from './WithdrawSection';

export const FundView = ({ fund, data, act }: TabProps & { fund: FundEntry }) => {
  const balance = data.fund_balances[fund.id]?.balance ?? 0;
  const outstanding = data.fund_balances[fund.id]?.outstanding_principal ?? 0;
  const viewOnly = !fund.can_withdraw && !fund.can_issue && fund.can_view;
  const withdrawalLimit = fund.id === 'bathhouse' && !fund.can_issue
    ? Math.min(balance, data.bathhouse_withdraw_remaining) : balance;

  return (
    <>
      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>{fund.label}</h2></div>
        <dl className="MeisterPanel__entries">
          <div><dt>Coffers</dt><dd>{balance}m</dd></div>
          {outstanding > 0 && <div><dt>In loan circulation</dt><dd>{outstanding}m</dd></div>}
          <div><dt>Authority</dt><dd>{fund.authority_label}</dd></div>
        </dl>
        {viewOnly && <p className="MeisterPanel__help">You may view these coffers, but not withdraw or issue loans.</p>}
      </section>
      {!!fund.can_withdraw && <WithdrawSection fund={fund} balance={withdrawalLimit} act={act} />}
      {!!fund.can_issue && !!fund.supports_loans && <IssueLoanSection fund={fund} data={data} act={act} />}
      {fund.id === 'bathhouse' && !!fund.can_view && (
        <BathhouseFundSection key={`employment:${data.is_bathmaster}`} data={data} act={act} />
      )}
      {!!data.bathhouse_ordinance_available &&
        (fund.id === 'bathhouse' || fund.id === 'church') && !!fund.can_issue && (
          <BathhouseOrdinanceSection key={`ordinance:${data.bathhouse_ordinance_active}`} data={data} act={act} />
        )}
      <FundActivity fund={fund} data={data} />
    </>
  );
};
