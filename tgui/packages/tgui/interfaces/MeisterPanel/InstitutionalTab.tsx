import { useState } from 'react';

import { FundView } from './Institutional/FundView';
import { type TabProps } from './types';

export const InstitutionalTab = ({ data, act }: TabProps) => {
  const accessibleFunds = data.funds.filter(
    (f) => f.can_issue || f.can_withdraw || f.can_view,
  );
  const [selectedFundId, setSelectedFundId] = useState<string>(
    accessibleFunds[0]?.id ?? '',
  );
  const selectedFund = accessibleFunds.find((f) => f.id === selectedFundId) ?? accessibleFunds[0];

  if (!selectedFund) {
    return <p className="MeisterPanel__empty">You hold no institutional authority.</p>;
  }

  return (
    <>
      <nav className="MeisterPanel__funds" aria-label="Institutional funds">
        {accessibleFunds.map((f) => (
          <button
            type="button"
            key={f.id}
            aria-pressed={selectedFund.id === f.id}
            onClick={() => setSelectedFundId(f.id)}
          >
            {f.label}
          </button>
        ))}
      </nav>
      <FundView key={selectedFund.id} fund={selectedFund} data={data} act={act} />
    </>
  );
};
