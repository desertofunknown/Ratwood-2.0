import { useMemo } from 'react';
import { DayCell } from './DayCell';
import {
  assignBarSlots,
  buildWeekRows,
  type CalendarEvent,
  eventsForDay,
  MAX_BARS_PER_DAY,
} from './shared';

type MonthGridProps = {
  events: CalendarEvent[];
  daysInMonth: number;
  daysInWeek: number;
  selectedDay: number | null;
  focusedDay: number;
  todayDay: number;
  todayWeek: number;
  viewingToday: boolean;
  onSelectDay: (day: number) => void;
  onFocusDay: (day: number) => void;
};

export const MonthGrid = (props: MonthGridProps) => {
  const {
    events,
    daysInMonth,
    daysInWeek,
    selectedDay,
    focusedDay,
    todayDay,
    todayWeek,
    viewingToday,
    onSelectDay,
    onFocusDay,
  } = props;

  const slotByEventId = useMemo(() => assignBarSlots(events), [events]);
  const weeks = useMemo(
    () => buildWeekRows(daysInMonth, daysInWeek),
    [daysInMonth, daysInWeek],
  );

  return (
    <>
      {weeks.map((row, weekIndex) => {
        const weekNumber = weekIndex + 1;
        const isCurrentWeek = viewingToday && weekNumber === todayWeek;
        return (
          <div
            key={weekIndex}
            className={`Calendar__week${isCurrentWeek ? ' Calendar__week--current' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${daysInWeek}, minmax(0, 1fr))`,
            }}
          >
            {row.map((day) => {
              const dayEvents = eventsForDay(events, day);
              const slotted = dayEvents
                .map((e) => ({ event: e, slot: slotByEventId.get(e.id) ?? 0 }))
                .sort((a, b) => a.slot - b.slot);
              const visible = slotted.filter(
                (entry) => entry.slot < MAX_BARS_PER_DAY,
              );
              const overflow = slotted.length - visible.length;
              return (
                <DayCell
                  key={day}
                  day={day}
                  isToday={viewingToday && day === todayDay}
                  isSelected={selectedDay === day}
                  tabIndex={focusedDay === day ? 0 : -1}
                  events={dayEvents}
                  visible={visible}
                  overflow={overflow}
                  onClick={() => onSelectDay(day)}
                  onFocus={() => onFocusDay(day)}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
};
