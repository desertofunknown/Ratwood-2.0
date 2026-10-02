import {
  compactButtonStyle,
  denseRowStyle,
  FONT_BODY,
  FONT_SMALL,
  INK,
  INK_FAINT,
  INK_SOFT,
  PriceTag,
} from '../common/parchment';
import type { ActFn, VendingPack } from './types';
import { starsIfIlliterate } from './util';

type Props = {
  pack: VendingPack;
  budget: number;
  canRead: boolean;
  showCategory: boolean;
  browseOnly: boolean;
  act: ActFn;
};

export const PackRow = (props: Props) => {
  const { pack, budget, canRead, showCategory, browseOnly, act } = props;
  const cantAfford = budget < pack.price;
  const hasTariff = pack.price_tariff > 0;
  const priceTitle = hasTariff
    ? `${pack.price_base}m + ${pack.price_tariff}m tariff = ${pack.price}m`
    : `${pack.price}m`;
  return (
    <div style={{ ...denseRowStyle, padding: '4px 0', gap: '8px' }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowWrap: 'anywhere',
          fontSize: FONT_BODY,
          color: INK,
        }}
        title={starsIfIlliterate(pack.name, canRead)}
      >
        {pack.qty > 1 && (
          <span
            style={{
              color: INK_SOFT,
              marginRight: '4px',
              fontSize: FONT_SMALL,
            }}
          >
            x{pack.qty}
          </span>
        )}
        {starsIfIlliterate(pack.name, canRead)}
        {showCategory && (
          <div style={{ fontSize: FONT_SMALL, color: INK_SOFT }}>
            {starsIfIlliterate(pack.category, canRead)}
          </div>
        )}
      </div>
      <PriceTag
        price={pack.price}
        cantAfford={cantAfford}
        title={priceTitle}
      />
      <div style={{ flexShrink: 0 }}>
        {browseOnly ? (
          <span
            style={{
              color: INK_FAINT,
              fontSize: FONT_SMALL,
            }}
          >
            browse
          </span>
        ) : (
          <button
            type="button"
            style={compactButtonStyle({ disabled: cantAfford })}
            disabled={cantAfford}
            onClick={() => act('buy', { ref: pack.ref })}
            aria-label={`Buy ${starsIfIlliterate(pack.name, canRead)} for ${pack.price}m`}
            title={cantAfford ? 'Insert more mammons to buy this item' : priceTitle}
          >
            Buy
          </button>
        )}
      </div>
    </div>
  );
};
