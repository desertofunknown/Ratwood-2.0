import type { HarborRealm } from '../types';
import { RealmRow } from './RealmRow';

export const RealmsView = (props: { realms: HarborRealm[] }) => (
  <>
    <h3 className="GoldfaceHarbor__section">
      Foreign Realms <span>({props.realms.length})</span>
    </h3>
    {props.realms.length ? (
      props.realms.map((realm) => <RealmRow key={realm.id} realm={realm} />)
    ) : (
      <p className="GoldfaceHarbor__empty">No foreign realms recorded.</p>
    )}
  </>
);
