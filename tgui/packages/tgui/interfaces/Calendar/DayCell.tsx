import type { CalendarEvent } from './shared';
import { MAX_BARS_PER_DAY } from './shared';
import { EventBar } from './EventBar';

type SlottedEvent = { event: CalendarEvent; slot: number };
type DayCellProps = {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  tabIndex: number;
  events: CalendarEvent[];
  visible: SlottedEvent[];
  overflow: number;
  onClick: () => void;
  onFocus: () => void;
};

export const DayCell = ({
  day,
  isToday,
  isSelected,
  tabIndex,
  events,
  visible,
  overflow,
  onClick,
  onFocus,
}: DayCellProps) => (
  <button
    type="button"
    className={`Calendar__day${isToday ? ' Calendar__day--today' : ''}`}
    tabIndex={tabIndex}
    data-calendar-day={day}
    aria-pressed={isSelected}
    aria-current={isToday ? 'date' : undefined}
    aria-label={`Day ${day}${isToday ? ', today' : ''}. ${events.length ? events.map((event) => event.title).join(', ') : 'No events.'}`}
    onClick={onClick}
    onFocus={onFocus}
    title={events.map((event) => event.title).join(', ')}
  >
    <span className="Calendar__dayNumber">{day}</span>
    <span className="Calendar__ribbons" aria-hidden="true">
      {Array.from({ length: MAX_BARS_PER_DAY }, (_, slot) => {
        const entry = visible.find((event) => event.slot === slot);
        return entry ? (
          <EventBar
            key={slot}
            color={entry.event.color_tag}
            isStart={day === entry.event.day}
            isEnd={day === entry.event.day + entry.event.duration_days - 1}
            label={entry.event.title}
          />
        ) : (
          <span key={slot} className="Calendar__ribbonSpace" />
        );
      })}
    </span>
    {overflow > 0 && (
      <span className="Calendar__overflow">+{overflow} more</span>
    )}
  </button>
);
