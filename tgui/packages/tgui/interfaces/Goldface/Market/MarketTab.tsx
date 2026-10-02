import { MarketView } from '../../Noticeboard/AvisaSections/MarketSection';
import type { HarborData } from '../types';

export const MarketTab = (props: { harbor?: HarborData }) => {
  const { harbor } = props;
  return (
    <div className="MarketRegisterTheme--dark">
      {harbor ? (
        <MarketView market={harbor.market_data} />
      ) : (
        <div className="MarketRegister">
          <p className="MarketRegister__muted">
            The market ledgers are not yet drawn up.
          </p>
        </div>
      )}
    </div>
  );
};
