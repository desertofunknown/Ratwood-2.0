import type { SequestrationState } from './types';

export const ArrearsBanner = ({
  sequestration,
}: {
  sequestration: SequestrationState;
}) =>
  !sequestration?.in_arrears ? null : (
    <details className="StewardDesk__notice StewardDesk__notice--warning">
      <summary>
        Arrears with the Burghers: {sequestration.debt}m. Another missed payroll
        brings sequestration.
      </summary>
      <p>
        The Crown owes {sequestration.debt}m to the Burghers of Rotwood Vale for
        the day's interest-free advance. All inflow into the Crown's Purse is
        skimmed against the debt until it is settled. Should the Crown miss the
        next dawn's payroll, the realm enters sequestration.
      </p>
    </details>
  );
