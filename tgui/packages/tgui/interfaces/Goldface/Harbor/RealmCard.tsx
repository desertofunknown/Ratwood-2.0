import type { HarborRealm, MarketCondition, PoolGood } from '../types';

export const ConditionPill = ({
  condition,
}: {
  condition: MarketCondition;
}) => (
  <strong
    className={`GoldfaceHarbor__condition GoldfaceHarbor__condition--${condition.tone || 'neutral'}`}
    title={condition.description}
  >
    {condition.name}
  </strong>
);

export const CategoryPill = ({ name }: { name: string }) => (
  <span className="GoldfaceHarbor__term">{name}</span>
);

const Good = ({ good, rare }: { good: PoolGood; rare: boolean }) => {
  const notes = [rare ? 'Sometimes' : 'Always'];
  if (good.added_only) notes.push('introduced by an event');
  if (good.delta > 0)
    notes.push(`boosted by ${good.delta} event${good.delta > 1 ? 's' : ''}`);
  if (good.delta < 0)
    notes.push(
      `suppressed by ${-good.delta} event${good.delta < -1 ? 's' : ''}`,
    );
  if (good.removed) notes.push('removed by an event');
  return (
    <span
      className={`GoldfaceHarbor__term${good.removed ? ' GoldfaceHarbor__removed' : ''}`}
      title={notes.join(' — ')}
    >
      {good.name}
      {rare && <small> (sometimes)</small>}
      {!!good.added_only && <small> (event)</small>}
      {good.delta !== 0 && (
        <small>
          {' '}
          {good.delta > 0
            ? '+'.repeat(Math.min(good.delta, 4))
            : '-'.repeat(Math.min(-good.delta, 4))}
        </small>
      )}
    </span>
  );
};

export const RealmCard = ({ realm }: { realm: HarborRealm }) => (
  <dl className="GoldfaceHarbor__trade">
    <dt>Demand</dt>
    <dd>
      {realm.demanded_categories.length
        ? realm.demanded_categories.map((name) => (
            <CategoryPill key={name} name={name} />
          ))
        : '—'}
    </dd>
    <dt>Buys</dt>
    <dd>
      {realm.basic_buys.length + realm.rare_buys.length ? (
        <>
          {realm.basic_buys.map((good) => (
            <Good key={`b-${good.name}`} good={good} rare={false} />
          ))}
          {realm.rare_buys.map((good) => (
            <Good key={`r-${good.name}`} good={good} rare />
          ))}
        </>
      ) : (
        'none'
      )}
    </dd>
    <dt>Sells</dt>
    <dd>
      {realm.basic_sells.length + realm.rare_sells.length ? (
        <>
          {realm.basic_sells.map((good) => (
            <Good key={`b-${good.name}`} good={good} rare={false} />
          ))}
          {realm.rare_sells.map((good) => (
            <Good key={`r-${good.name}`} good={good} rare />
          ))}
        </>
      ) : (
        'none'
      )}
    </dd>
  </dl>
);
