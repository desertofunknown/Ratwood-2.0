import type { ActFn } from './types';
import { starsIfIlliterate } from './util';

type Props = {
  budget: number;
  canRead: boolean;
  isProprietor: boolean;
  isPublic: boolean;
  act: ActFn;
};

export const MammonRow = (props: Props) => {
  const { budget, canRead, isProprietor, isPublic, act } = props;
  return (
    <div className="Goldface__balance">
      <div>
        <span>{starsIfIlliterate('Mammon loaded', canRead)}</span>
        <strong>{budget}<small>m</small></strong>
      </div>
      <div className="Goldface__accountActions">
        <button type="button" disabled={budget <= 0} onClick={() => act('change')}>Return coins</button>
        {isProprietor && !isPublic && (
          <button type="button" onClick={() => act('secrets')}>
            {starsIfIlliterate('Secrets', canRead)}
          </button>
        )}
      </div>
    </div>
  );
};
