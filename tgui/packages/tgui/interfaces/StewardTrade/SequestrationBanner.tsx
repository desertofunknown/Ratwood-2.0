import type { SequestrationState } from './types';

export const SequestrationBanner = ({
  sequestration,
}: {
  sequestration: SequestrationState;
}) =>
  !sequestration?.active ? null : (
    <details className="StewardDesk__notice StewardDesk__notice--danger">
      <summary>
        Sequestration declared: {sequestration.debt}m debt. Trade controls and
        stockpile pricing locked.
      </summary>
      <p>
        Sealed under the Burghers' mark. Following the Crown's default, the
        Ferentian Trading Company holds the sequestered revenues of the realm
        and farms the customs and salt tolls in perpetuity until the{' '}
        {sequestration.debt}m debt is repaid. Petitions, taxation, and the lash
        of fines remain.
      </p>
    </details>
  );
