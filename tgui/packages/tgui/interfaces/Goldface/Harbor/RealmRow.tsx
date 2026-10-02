import type { HarborRealm } from '../types';
import { CategoryPill, ConditionPill, RealmCard } from './RealmCard';

export const RealmRow = ({ realm }: { realm: HarborRealm }) => {
  const conditions = realm.market_conditions ?? [];
  return (
    <section className="GoldfaceHarbor__realm">
      <h4>
        {realm.name}
        {!!realm.is_kin && (
          <span className="GoldfaceHarbor__kin" title="Kinship Bonus active">
            Kin
          </span>
        )}
      </h4>
      <RealmCard realm={realm} />
      <details className="GoldfaceHarbor__help">
        <summary>
          Cultural stock &amp; market conditions
          {conditions.length > 0 && (
            <> — {conditions.map((condition) => condition.name).join(', ')}</>
          )}
        </summary>
        {realm.cultural_pack_names.length > 0 && (
          <p>
            <strong>Cultural Stock: </strong>
            {realm.cultural_pack_names.map((name) => (
              <CategoryPill key={name} name={name} />
            ))}
          </p>
        )}
        {conditions.length ? (
          conditions.map((condition) => (
            <p key={condition.name}>
              <ConditionPill condition={condition} /> {condition.description}
            </p>
          ))
        ) : (
          <p>No market conditions.</p>
        )}
      </details>
    </section>
  );
};
