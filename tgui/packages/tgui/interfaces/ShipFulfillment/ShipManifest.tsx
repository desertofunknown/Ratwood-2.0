import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../../backend';

export type DemandLine = {
  good: string;
  good_name: string;
  qty_target: number;
  qty_fulfilled: number;
  offered_price: number;
  kin_offered_price?: number;
  producer_payout?: number;
  by_bottle?: BooleanLike;
  tag?: string;
};

export type Manifest = {
  ship_id: string;
  ship_name: string;
  realm_id: string;
  realm_name?: string;
  is_kin?: BooleanLike;
  typical_provisions?: string;
  lines: DemandLine[];
};

export type ShipManifestData = {
  manifests: Manifest[];
  middleman_cut_percent: number;
  kinship_sell_pct?: number;
  can_manage?: BooleanLike;
  duty_suspended?: BooleanLike;
  duty_rate_pct?: number;
  duty_collected_here?: number;
  duty_evaded_here?: number;
};

const SECTIONS = [
  ['bulk', 'Bulk trade', 'Bulk demand for the ship to carry back home.'],
  ['victualling_fresh', 'Fresh provisions', 'Fresh provisions for the crew.'],
  [
    'victualling_preserved',
    'Preserved provisions',
    'Preserved foods for the voyage.',
  ],
  [
    'victualling_drinks',
    'Drinks',
    'Drinks for the crews and to resell back home. Spirits are sold by the bottle. For keg orders, drag a finished, untapped fermentation keg onto the crate; loose bottles cannot fill keg orders.',
  ],
] as const;

const DemandRow = ({ line }: { line: DemandLine }) => {
  const remaining = Math.max(0, line.qty_target - line.qty_fulfilled);
  const hasKin =
    line.kin_offered_price !== undefined &&
    line.kin_offered_price > line.offered_price;
  const price = hasKin ? line.kin_offered_price! : line.offered_price;

  return (
    <tr className={remaining === 0 ? 'ShipManifest__fulfilled' : undefined}>
      <th scope="row">{line.good_name}</th>
      <td>
        <span>
          {line.qty_fulfilled} / {line.qty_target}
        </span>
        <span className="ShipManifest__annotation">
          {remaining === 0 ? 'Fulfilled' : `${remaining} remaining`}
        </span>
      </td>
      <td>
        <span className={hasKin ? 'ShipManifest__kin' : undefined}>
          {price}m
        </span>
        {line.tag === 'victualling_drinks' && (
          <span className="ShipManifest__annotation">
            {line.by_bottle ? 'per bottle' : 'per keg'}
          </span>
        )}
        {hasKin && (
          <span className="ShipManifest__annotation">
            Base {line.offered_price}m · Kin +{price - line.offered_price}m
          </span>
        )}
      </td>
      <td>
        {line.producer_payout === undefined ? '—' : `${line.producer_payout}m`}
      </td>
    </tr>
  );
};

const Vessel = ({ manifest }: { manifest: Manifest }) => {
  const grouped = new Map<string, DemandLine[]>();
  for (const line of manifest.lines) {
    const tag = line.tag || 'bulk';
    const lines = grouped.get(tag) || [];
    lines.push(line);
    grouped.set(tag, lines);
  }
  const tags = [
    ...SECTIONS.map(([tag]) => tag).filter((tag) => grouped.has(tag)),
    ...Array.from(grouped.keys()).filter(
      (tag) => !SECTIONS.some(([known]) => tag === known),
    ),
  ];

  return (
    <details className="ShipManifest__vessel" open>
      <summary>
        <span className="ShipManifest__shipName">{manifest.ship_name}</span>
        <span className="ShipManifest__realm">
          {manifest.realm_name || manifest.realm_id}
        </span>
        {!!manifest.is_kin && (
          <span
            className="ShipManifest__kin"
            title="Kin ship — demand payouts get the Kinship bonus"
          >
            Kin
          </span>
        )}
      </summary>
      {!!manifest.typical_provisions && (
        <p className="ShipManifest__muted">
          Typical provisions: {manifest.typical_provisions}
        </p>
      )}
      {tags.length === 0 ? (
        <p className="ShipManifest__empty">
          This vessel has no listed demands.
        </p>
      ) : (
        <table
          className="ShipManifest__table"
          aria-label={`${manifest.ship_name} demands`}
        >
          <thead>
            <tr>
              <th scope="col">Goods</th>
              <th scope="col">Delivered</th>
              <th scope="col">Offer / unit</th>
              <th scope="col">Est. net</th>
            </tr>
          </thead>
          {tags.map((tag) => {
            const section = SECTIONS.find(([known]) => known === tag);
            return (
              <tbody key={tag}>
                <tr>
                  <th scope="rowgroup" colSpan={4}>
                    <strong>{section?.[1] || tag}</strong>
                    {section && (
                      <span className="ShipManifest__hint">{section[2]}</span>
                    )}
                  </th>
                </tr>
                {grouped.get(tag)!.map((line, index) => (
                  <DemandRow key={`${line.good}|${index}`} line={line} />
                ))}
              </tbody>
            );
          })}
        </table>
      )}
    </details>
  );
};

export const ShipManifest = () => {
  const { data, act } = useBackend<ShipManifestData>();
  const {
    manifests,
    middleman_cut_percent,
    can_manage,
    duty_suspended,
    duty_rate_pct = 0,
    duty_collected_here = 0,
    duty_evaded_here = 0,
  } = data;

  return (
    <div className="ShipManifest">
      <header className="ShipManifest__header">
        <h1>Manifest of Bulk Demands</h1>
        <button
          type="button"
          title="Open the economy guidebook"
          onClick={() => act('help')}
        >
          Guidebook
        </button>
      </header>
      <p>
        Drop matching goods at the crate to fulfill. The Merchant takes{' '}
        {middleman_cut_percent}% as middleman. Posted Crown duty:{' '}
        {duty_rate_pct}%.
      </p>
      <p className="ShipManifest__muted">
        Net estimates use posted duty and one standard-quality unit. Quality,
        bundled sales, rounding, and collected duty can change payment. The
        first matching ship receives your deposit.
      </p>
      {manifests.length === 0 ? (
        <p className="ShipManifest__empty">
          No vessels at the pier are buying. Hail one to open a market.
        </p>
      ) : (
        manifests.map((manifest) => (
          <Vessel key={manifest.ship_id} manifest={manifest} />
        ))
      )}
      {!!can_manage && (
        <details className="ShipManifest__underledger" open>
          <summary>Underledger</summary>
          <div className="ShipManifest__duty">
            <button
              type="button"
              className={
                duty_suspended
                  ? 'ShipManifest__dodging'
                  : 'ShipManifest__paying'
              }
              aria-pressed={!!duty_suspended}
              onClick={() => act('toggle_duty')}
            >
              Crown Duty: {duty_suspended ? 'DODGING' : 'PAYING'}
            </button>
            <span>
              Paid here: {duty_collected_here}m. Dodged here: {duty_evaded_here}
              m.
            </span>
          </div>
          <p className="ShipManifest__muted">
            Export duty runs {duty_rate_pct}%. Dodging keeps it off the goods
            sold here. The shortfall is only known to the Merchant or Shophand.
            The Crown must guess.
          </p>
        </details>
      )}
    </div>
  );
};
