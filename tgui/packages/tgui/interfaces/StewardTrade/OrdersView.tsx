import { useBackend } from '../../backend';
import type { Data, Order } from './types';

const QUALITY_TIER_TOOLTIP = [
  'Quality multipliers vs. canonical price:',
  '  scavenged 25%',
  '  ruined 20%',
  '  awful 35%',
  '  crude 65%',
  '  rough 85%',
  '  (standard) 100%',
  '  fine 110%',
  '  flawless 120%',
  '  masterwork 135%',
].join('\n');

export const OrdersView = (props: { data: Data }) => {
  const { act } = useBackend<Data>();
  const { active_orders, order_pool_cap, good_catalog, region_catalog } =
    props.data;
  const groups: Order[][] = [];
  const pairs = new Map<string, Order[]>();
  // The pool issues two orders per pair; a fulfilled half can leave one survivor.
  for (const order of active_orders) {
    const pair = order.pair_id ? pairs.get(order.pair_id) : undefined;
    if (pair) {
      pair.push(order);
    } else {
      const group = [order];
      groups.push(group);
      if (order.pair_id) pairs.set(order.pair_id, group);
    }
  }

  return (
    <section className="StewardOrders">
      <h2>
        Active Standing Orders ({active_orders.length}/{order_pool_cap})
      </h2>
      {active_orders.length === 0 ? (
        <p className="StewardOrders__muted">
          No active orders. Check back tomorrow.
        </p>
      ) : (
        groups.map((orders) => {
          const [primary, sibling] = orders;
          const paired = !!primary.pair_id;
          return (
            <section
              key={primary.ref}
              className={paired ? 'StewardOrders__pair' : undefined}
            >
              {paired && (
                <h3 className="StewardOrders__pairHeading">
                  {primary.pair_label ?? sibling?.pair_label ?? 'Linked Pair'}
                  <span>
                    {region_catalog[primary.region_id]?.name ??
                      primary.region_id}
                  </span>
                  <strong>
                    {orders.reduce((total, order) => total + order.payout, 0)}m
                    total
                  </strong>
                  <span className="StewardOrders__muted">
                    (linked pair, one slot)
                  </span>
                </h3>
              )}
              {orders.map((order) => (
                <OrderEntry
                  key={order.ref}
                  order={order}
                  regionCatalog={region_catalog}
                  goodCatalog={good_catalog}
                  onFulfill={() => act('fulfill_order', { ref: order.ref })}
                />
              ))}
            </section>
          );
        })
      )}
    </section>
  );
};

const OrderEntry = (props: {
  order: Order;
  regionCatalog: Data['region_catalog'];
  goodCatalog: Data['good_catalog'];
  onFulfill: () => void;
}) => {
  const o = props.order;
  const pureWarehouse = !!o.has_warehouse && !o.has_stockpile;
  return (
    <article className="StewardOrders__entry">
      <div className="StewardOrders__details">
        <h3>{o.name}</h3>
        <div className="StewardOrders__annotations">
          <span>{props.regionCatalog[o.region_id]?.name ?? o.region_id}</span>
          <span>{o.days_left}d left</span>
          {!!o.region_blockaded && (
            <strong className="StewardOrders__bad">BLOCKADED</strong>
          )}
          {!!o.has_warehouse && (
            <span className="StewardOrders__cool">WAREHOUSE</span>
          )}
          {!!o.has_stockpile && (
            <span className="StewardOrders__good">STOCKPILE</span>
          )}
          {o.days_left <= 1 && !o.region_blockaded && !pureWarehouse && (
            <strong className="StewardOrders__bad">URGENT</strong>
          )}
          {!!o.petitioned && (
            <span className="StewardOrders__accent">PETITIONED</span>
          )}
        </div>
        {o.description && (
          <p className="StewardOrders__muted">{o.description}</p>
        )}
        <p>
          <span className="StewardOrders__muted">Items: </span>
          {o.items.map((item, index) => {
            const stockpile = item.route === 'stockpile';
            return (
              <span key={item.good_id}>
                {index > 0 && ', '}
                <span
                  className={
                    stockpile && item.have < item.needed
                      ? 'StewardOrders__bad'
                      : 'StewardOrders__good'
                  }
                >
                  {item.needed}{' '}
                  {props.goodCatalog[item.good_id]?.name ?? item.good_id}
                  {stockpile && ` (${item.have} in stock)`}
                </span>
              </span>
            );
          })}
        </p>
        {!!o.has_warehouse && (
          <p className="StewardOrders__muted" title={QUALITY_TIER_TOOLTIP}>
            Warehouse goods pay -80% to +35% based on the quality of submitted
            items.
          </p>
        )}
      </div>
      <div className="StewardOrders__settlement">
        <div>
          Payout: <strong className="StewardOrders__accent">{o.payout}m</strong>
        </div>
        <FulfillButton order={o} onFulfill={props.onFulfill} />
      </div>
    </article>
  );
};

const FulfillButton = (props: { order: Order; onFulfill: () => void }) => {
  const o = props.order;
  if (o.region_blockaded) {
    return (
      <button type="button" disabled className="StewardOrders__bad">
        Fulfill &mdash; road blockaded
      </button>
    );
  }
  const pureWarehouse = !!o.has_warehouse && !o.has_stockpile;
  const mixed = !!o.has_warehouse && !!o.has_stockpile;
  if (pureWarehouse) {
    return (
      <button
        type="button"
        onClick={props.onFulfill}
        className="StewardOrders__cool"
      >
        Fulfill from Warehouse
      </button>
    );
  }
  if (o.can_fulfill) {
    return (
      <button
        type="button"
        onClick={props.onFulfill}
        className="StewardOrders__good"
      >
        {mixed ? 'Fulfill (Warehouse + Stockpile)' : 'Fulfill from Stockpile'}
      </button>
    );
  }
  if (o.can_partial) {
    return (
      <button
        type="button"
        onClick={props.onFulfill}
        title={`Settle short - ${o.partial_pct}% of value covered, paid at 85% of the delivered share. Missing: ${o.shortfall_text}`}
        className="StewardOrders__accent"
      >
        Fulfill Partial &mdash; {o.partial_pct}% ({o.partial_payout_preview}m)
      </button>
    );
  }
  return (
    <button type="button" disabled title={o.shortfall_text}>
      Fulfill &mdash; {o.shortfall_text || 'insufficient stock'}
    </button>
  );
};
