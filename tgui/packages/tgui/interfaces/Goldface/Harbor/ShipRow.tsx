import { useState } from 'react';

import type { ActFn, BulkLine, HarborRealm, HarborShip } from '../types';
import { RealmCard } from './RealmCard';

const formatDuration = (totalSeconds: number) => {
  if (totalSeconds <= 0) return 'now';
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return 'less than a minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
};

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const titleCase = (s: string) =>
  s
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

type Props = {
  ship: HarborShip;
  budget: number;
  tariffRate: number;
  act: ActFn;
  realm?: HarborRealm;
  onHail?: () => void;
  hailDisabled?: boolean;
  hailDisabledReason?: string;
  onSendAway?: () => void;
};

const Price = ({ line, price }: { line: BulkLine; price: number }) => (
  <>
    {price !== line.offered_price && <del>{line.offered_price}m</del>}
    <span
      className={
        price !== line.offered_price ? 'GoldfaceHarbor__kin' : undefined
      }
    >
      {price}m
    </span>
  </>
);

const SupplyLineRow = ({
  line,
  shipId,
  shipName,
  budget,
  tariffRate,
  act,
}: {
  line: BulkLine;
  shipId: string;
  shipName: string;
  budget: number;
  tariffRate: number;
  act: ActFn;
}) => {
  const [quantity, setQuantity] = useState('1');
  const remaining = Math.max(
    0,
    Math.floor(line.qty_target - line.qty_fulfilled),
  );
  const entered = Number(quantity);
  const validQuantity =
    quantity.trim() !== '' && Number.isSafeInteger(entered) && entered >= 1;
  const qty = validQuantity ? Math.min(entered, remaining) : 0;
  const unitPrice =
    line.kin_offered_price !== undefined &&
    line.kin_offered_price < line.offered_price
      ? line.kin_offered_price
      : line.offered_price;
  const gross = unitPrice * qty;
  // Match BYOND's single-precision multiplication and integer round() for duty.
  const duty = Math.floor(
    Math.fround(Math.fround(tariffRate) * Math.fround(gross)),
  );
  const total = gross + duty;
  const disabled = !validQuantity || remaining === 0 || budget < total;
  const reason = !validQuantity
    ? 'Enter a positive whole quantity.'
    : budget < total
      ? `Need ${total}m, have ${budget}m`
      : `Buy ${qty} for ${total}m (including ${duty}m duty)`;
  return (
    <tr
      title={`Selling ${titleCase(line.good_name)} at ${unitPrice}m each. ${line.qty_fulfilled} of ${line.qty_target} sold.${unitPrice !== line.offered_price ? ` Kinship -${line.offered_price - unitPrice}m off ${line.offered_price}m.` : ''}`}
    >
      <th scope="row">{titleCase(line.good_name)}</th>
      <td>
        {line.qty_fulfilled}/{line.qty_target}
      </td>
      <td>
        <Price line={line} price={unitPrice} />
      </td>
      <td className="GoldfaceHarbor__purchase">
        {remaining === 0 ? (
          <span>Sold out</span>
        ) : (
          <>
            <input
              type="number"
              min={1}
              max={remaining}
              step={1}
              aria-label={`Quantity of ${titleCase(line.good_name)} from ${shipName}`}
              aria-invalid={!validQuantity}
              value={validQuantity ? qty : quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <button
              type="button"
              disabled={disabled}
              title={reason}
              aria-label={`Buy ${titleCase(line.good_name)} from ${shipName}`}
              onClick={() => {
                if (!disabled)
                  act('bulk_buy', { ship_id: shipId, good: line.good, qty });
              }}
            >
              Buy{validQuantity ? ` ${total}m` : ''}
            </button>
            <small>
              {validQuantity
                ? `${duty}m duty incl.`
                : 'Whole quantity required'}
            </small>
          </>
        )}
      </td>
    </tr>
  );
};

const DemandRows = ({ lines }: { lines: BulkLine[] }) => (
  <>
    {['Goods', 'Food', 'Drinks'].map((group) => {
      const grouped = lines.filter(
        (line) =>
          (line.tag === 'victualling_drinks'
            ? 'Drinks'
            : line.tag === 'victualling_fresh' ||
                line.tag === 'victualling_preserved'
              ? 'Food'
              : 'Goods') === group,
      );
      return (
        grouped.length > 0 && (
          <tbody key={group}>
            <tr className="GoldfaceHarbor__group">
              <th colSpan={3}>{group}</th>
            </tr>
            {grouped.map((line, index) => {
              const price =
                line.kin_offered_price !== undefined &&
                line.kin_offered_price > line.offered_price
                  ? line.kin_offered_price
                  : line.offered_price;
              return (
                <tr
                  key={`${line.good}-${index}`}
                  className={
                    line.qty_fulfilled >= line.qty_target
                      ? 'GoldfaceHarbor__fulfilled'
                      : undefined
                  }
                  title={`Buying ${line.qty_target} ${titleCase(line.good_name)} at ${price}m each. ${line.qty_fulfilled} delivered so far.${price !== line.offered_price ? ` Kinship +${price - line.offered_price}m over base ${line.offered_price}m.` : ''}`}
                >
                  <th scope="row">{titleCase(line.good_name)}</th>
                  <td>
                    {line.qty_fulfilled}/{line.qty_target}
                  </td>
                  <td>
                    <Price line={line} price={price} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        )
      );
    })}
  </>
);

export const ShipRow = ({
  ship,
  budget,
  tariffRate,
  act,
  realm,
  onHail,
  hailDisabled,
  hailDisabledReason,
  onSendAway,
}: Props) => {
  const hasBulk =
    (ship.bulk_demands?.length ?? 0) + (ship.bulk_supplies?.length ?? 0) > 0;
  return (
    <article className="GoldfaceHarbor__ship">
      <header className="GoldfaceHarbor__shipHeading">
        <div>
          <h4>{ship.ship_name}</h4>
          <p>
            {ship.captain_name && (
              <>
                Captain {ship.captain_name}
                {ship.port_of_origin ? ' — ' : ''}
              </>
            )}
            {ship.port_of_origin && <>Sailing from {ship.port_of_origin}</>}
          </p>
        </div>
        <div className="GoldfaceHarbor__shipActions">
          {ship.seconds_until_departure !== undefined && (
            <span>
              Departs{' '}
              {formatDuration(ship.seconds_until_departure) === 'now'
                ? 'now'
                : `in ${formatDuration(ship.seconds_until_departure)}`}
            </span>
          )}
          {onHail && (
            <button
              type="button"
              disabled={!!hailDisabled}
              title={hailDisabled ? hailDisabledReason : 'Hail this vessel'}
              onClick={onHail}
            >
              Hail
            </button>
          )}
          {onSendAway && (
            <button
              type="button"
              disabled={!ship.can_send_away}
              title={
                ship.auto_hailed
                  ? 'This vessel drifted in — dismiss her freely, no penalty.'
                  : ship.can_send_away
                    ? 'Send this vessel away early.'
                    : 'She has only just docked.'
              }
              onClick={onSendAway}
            >
              Send Away
            </button>
          )}
        </div>
      </header>
      <div className="GoldfaceHarbor__shipFacts">
        <strong>{realm?.name || ship.realm_id}</strong>
        <span>
          {ship.ship_type}, {ship.tonnage}t
          {ship.tonnage_mult > 1 && ` (${ship.tonnage_mult.toFixed(2)}x)`}
        </span>
        {!!ship.is_kin && (
          <span
            className="GoldfaceHarbor__kin"
            title="Kin ship — Kinship Bonus applies"
          >
            Kin
          </span>
        )}
        {!!ship.auto_hailed && <span>Drifted in</span>}
        {ship.expected_favor > 0 && (
          <span>
            Favor: {ship.favor_earned}m / {ship.expected_favor}m
          </span>
        )}
      </div>
      <details className="GoldfaceHarbor__help">
        <summary>Vessel terms{realm && ' & realm trade'}</summary>
        <p>
          Tonnage scales goods on offer and expected favor. 100t baseline =
          1.00x, 800t galleon caps at 2.00x. This vessel:{' '}
          {ship.tonnage_mult.toFixed(2)}x.
        </p>
        {!!ship.auto_hailed && (
          <p>
            This vessel sailed in unbidden while no Merchant was tending the
            harbor. Dismiss her freely with no penalty.
          </p>
        )}
        {ship.expected_favor > 0 && (
          <p>
            Send-off favor: Honored at 100% of target gives you the full
            delivered value as favor plus a refunded hail. Partial at 50% gives
            you half delivered value as favor. Below 50% is Dishonored and costs{' '}
            {Math.round(250 * ship.tonnage_mult)}m favor for this vessel.
          </p>
        )}
        {realm && <RealmCard realm={realm} />}
      </details>
      {hasBulk && (
        <div className="GoldfaceHarbor__cargo">
          <div>
            {ship.bulk_demands?.length ? (
              <table>
                <caption>Buying</caption>
                <thead>
                  <tr>
                    <th>Goods wanted</th>
                    <th>Delivered</th>
                    <th>Unit price</th>
                  </tr>
                </thead>
                <DemandRows lines={ship.bulk_demands} />
              </table>
            ) : (
              <p className="GoldfaceHarbor__empty">Buying — nothing wanted.</p>
            )}
          </div>
          <div>
            {ship.bulk_supplies?.length ? (
              <table>
                <caption>Selling</caption>
                <thead>
                  <tr>
                    <th>Goods offered</th>
                    <th>Sold</th>
                    <th>Unit price</th>
                    <th>Order total incl. duty</th>
                  </tr>
                </thead>
                <tbody>
                  {ship.bulk_supplies.map((line) => (
                    <SupplyLineRow
                      key={line.good}
                      line={line}
                      shipId={ship.ship_id}
                      shipName={ship.ship_name}
                      budget={budget}
                      tariffRate={tariffRate}
                      act={act}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="GoldfaceHarbor__empty">
                Selling — nothing on offer.
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
};
