import { type KeyboardEvent, useId, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import { DayDetail } from './DayDetail';
import { MonthGrid } from './MonthGrid';
import { Nav } from './Nav';
import { type CalendarData, eventsForDay } from './shared';
import { WeekdayHeader } from './WeekdayHeader';
import { WRAP_NOTES } from './wrapNotes';

const DAY_NAVIGATION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);
type DaySelection = { month: string; day: number } | null;

export const CalendarContent = () => {
  const { act, data } = useBackend<CalendarData>();
  const id = useId();
  const [selection, setSelection] = useState<DaySelection>(null);
  const [focus, setFocus] = useState<DaySelection>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const monthKey = `${data.view_year}-${data.view_month}`;
  const viewingToday =
    data.view_month === data.today_month && data.view_year === data.today_year;
  const meta = data.months.find((month) => month.number === data.view_month);
  const monthName = meta?.name ?? `Month ${data.view_month}`;
  const selectedDay = selection?.month === monthKey ? selection.day : null;
  const focusedDay = focus?.month === monthKey ? focus.day : null;
  const detailDay = selectedDay ?? (viewingToday ? data.today_day : null);
  const tabDay = Math.max(
    1,
    Math.min(data.days_in_month, focusedDay ?? detailDay ?? 1),
  );
  const navigate = (action: string, params?: Record<string, unknown>) => {
    setSelection(null);
    setFocus(null);
    act(action, params);
  };
  const handleDayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !DAY_NAVIGATION_KEYS.has(event.key) ||
      !target.matches('button[data-calendar-day]')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const day = Number(target.dataset.calendarDay);
    const weekStart = day - ((day - 1) % data.days_in_week);
    const next =
      event.key === 'Home'
        ? weekStart
        : event.key === 'End'
          ? weekStart + data.days_in_week - 1
          : day +
            (event.key === 'ArrowLeft'
              ? -1
              : event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowUp'
                  ? -data.days_in_week
                  : data.days_in_week);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-calendar-day="${Math.max(1, Math.min(data.days_in_month, next))}"]`,
      )
      ?.focus();
  };
  const handleDayKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      DAY_NAVIGATION_KEYS.has(event.key) &&
      (event.target as HTMLElement).matches('button[data-calendar-day]')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <main className="Calendar">
      <Nav
        seasonLine={meta ? `${meta.phase} ${meta.season}` : ''}
        year={data.view_year}
        months={data.months}
        viewMonth={data.view_month}
        showReturn={!viewingToday}
        onPrev={() => navigate('prev_month')}
        onNext={() => navigate('next_month')}
        onReturn={() => navigate('today')}
        onJump={(month) => navigate('jump_month', { month })}
      />
      {data.wrap_count > 0 && (
        <p className="Calendar__wrapNote">
          {WRAP_NOTES[Math.min(data.wrap_count - 1, WRAP_NOTES.length - 1)]}
        </p>
      )}
      <details className="Calendar__help">
        <summary>Keyboard controls</summary>
        <p id={`${id}-help`}>
          Arrows move between days. Home/End reach week edges. Enter/Space show
          details. Tab leaves the calendar.
        </p>
      </details>
      <WeekdayHeader names={data.weekday_names} />
      <div
        ref={gridRef}
        role="group"
        aria-label={`${monthName}, ${data.view_year}`}
        aria-describedby={`${id}-help`}
        onKeyDown={handleDayKeyDown}
        onKeyUp={handleDayKeyUp}
      >
        <MonthGrid
          events={data.events}
          daysInMonth={data.days_in_month}
          daysInWeek={data.days_in_week}
          selectedDay={detailDay}
          focusedDay={tabDay}
          todayDay={data.today_day}
          todayWeek={data.today_week}
          viewingToday={viewingToday}
          onSelectDay={(day) => setSelection({ month: monthKey, day })}
          onFocusDay={(day) => setFocus({ month: monthKey, day })}
        />
      </div>
      <DayDetail
        monthName={monthName}
        year={data.view_year}
        selectedDay={detailDay}
        events={detailDay === null ? [] : eventsForDay(data.events, detailDay)}
      />
    </main>
  );
};
