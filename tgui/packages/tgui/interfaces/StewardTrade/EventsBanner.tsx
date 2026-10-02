import type { EconomicEvent, GoodCatalogEntry } from './types';

export const EventsBanner = ({
  events,
  goodCatalog,
}: {
  events: EconomicEvent[];
  goodCatalog: Record<string, GoodCatalogEntry>;
}) => {
  if (!events?.length) return null;
  const shortages = events.filter(
    (event) => event.event_type === 'shortage',
  ).length;
  const gluts = events.filter(
    (event) => event.event_type === 'oversupply',
  ).length;
  return (
    <details className="StewardDesk__notice">
      <summary>
        Active Economic Events ({events.length}): {shortages} shortage
        {shortages === 1 ? '' : 's'}, {gluts} glut{gluts === 1 ? '' : 's'}
      </summary>
      <dl className="StewardDesk__events">
        {events.map((event) => {
          const shortage = event.event_type === 'shortage';
          const target = event.saturation_target || 0;
          const progress = event.saturation_progress || 0;
          return (
            <div key={event.name}>
              <dt>
                <strong
                  className={
                    shortage ? 'StewardDesk__bad' : 'StewardDesk__good'
                  }
                >
                  {event.name}
                </strong>{' '}
                ({event.days_left}d left)
              </dt>
              <dd>
                {event.description}
                {shortage && target > 0 && (
                  <p>
                    Relief: {progress} / {target} units delivered (
                    {Math.min(100, Math.round((progress / target) * 100))}%).
                    Accepts:{' '}
                    {(event.affected_goods || [])
                      .map((id) => goodCatalog[id]?.name || id)
                      .join(', ')}
                  </p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
};
