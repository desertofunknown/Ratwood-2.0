import {
  INK_FAINT,
  SEAL_AMBER,
  SEAL_GREEN,
  SEAL_RED,
} from '../common/parchment';
import { starsIfIlliterate } from './util';

type Props = {
  motto: string;
  canRead: boolean;
  tariffRatePct: number;
  tariffPaid: number;
  tariffEvaded: number;
  isProprietor: boolean;
  dodging: boolean;
  publicMarginPct?: number;
  publicMarginLabel?: string;
};

export const TariffHeader = (props: Props) => {
  const {
    motto,
    canRead,
    tariffRatePct,
    tariffPaid,
    tariffEvaded,
    isProprietor,
    dodging,
    publicMarginPct,
    publicMarginLabel,
  } = props;
  return (
    <div className="TradeTariff">
      <h1>{starsIfIlliterate(motto, canRead)}</h1>
      <div className="TradeTariff__rates">
        Crown duty: <b>{tariffRatePct}%</b>
        {isProprietor && dodging && (
          <span style={{ color: SEAL_RED, marginLeft: '8px' }}>
            <b>(TAX DODGING)</b>
          </span>
        )}
        {publicMarginPct !== undefined && (
          <span style={{ color: SEAL_AMBER, marginLeft: '8px' }}>
            · {publicMarginLabel || 'Public Margin'}: <b>+{publicMarginPct}%</b>
          </span>
        )}
        {isProprietor && (
          <span className="TradeTariff__payments">
            <span style={{ color: SEAL_GREEN }}>Paid: {tariffPaid}m</span>
            <span style={{ color: INK_FAINT, margin: '0 6px' }}>·</span>
            <span style={{ color: SEAL_RED }}>Evaded: {tariffEvaded}m</span>
          </span>
        )}
        <span className="TradeTariff__inclusive">Prices include duty.</span>
      </div>
    </div>
  );
};
