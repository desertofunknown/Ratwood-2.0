import type { BanditryProjection } from './types';

export const BanditryBanner = ({
  projection,
}: {
  projection: BanditryProjection;
}) => {
  if (!projection || (projection.total <= 0 && projection.debt <= 0))
    return null;
  return (
    <details className="StewardDesk__notice StewardDesk__notice--warning">
      <summary>
        Banditry
        {projection.debt > 0 &&
          `: ${projection.debt}m debt skimming all inflow`}
        {projection.total > 0 &&
          `; projected losses −${projection.total}m next dawn`}
      </summary>
      {(projection.lines || []).map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </details>
  );
};
