import type { CalendarEvent } from './shared';

type DayDetailProps = {
  monthName: string;
  year: number;
  selectedDay: number | null;
  events: CalendarEvent[];
};

export const DayDetail = ({
  monthName,
  year,
  selectedDay,
  events,
}: DayDetailProps) => (
  <section className="Calendar__detail" aria-label="Selected day">
    {selectedDay === null ? (
      <p className="Calendar__empty">Select a day to see its festivals.</p>
    ) : (
      <>
        <h2>
          {monthName} {selectedDay}, {year} AP
        </h2>
        {events.length === 0 ? (
          <p className="Calendar__empty">No events on this date.</p>
        ) : (
          events.map((event) => (
            <article key={event.id}>
              <h3 style={{ borderLeftColor: event.color_tag || undefined }}>
                {event.title}
              </h3>
              {event.desc
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              {event.duration_days > 1 && (
                <p className="Calendar__span">
                  {monthName} {event.day} – {monthName}{' '}
                  {event.day + event.duration_days - 1}
                </p>
              )}
            </article>
          ))
        )}
      </>
    )}
  </section>
);
