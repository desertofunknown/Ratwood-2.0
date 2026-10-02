import { useId } from 'react';
import type { MonthMeta } from './shared';

type NavProps = {
  seasonLine: string;
  year: number;
  months: MonthMeta[];
  viewMonth: number;
  showReturn: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReturn: () => void;
  onJump: (month: number) => void;
};

export const Nav = (props: NavProps) => {
  const id = useId();
  return (
    <header className="Calendar__nav">
      <div>
        <div className="Calendar__month">
          <label htmlFor={id}>Month</label>
          <select
            id={id}
            value={props.viewMonth}
            onChange={(event) =>
              props.onJump(Number(event.currentTarget.value))
            }
          >
            {props.months.map((month) => (
              <option key={month.number} value={month.number}>
                {month.name}
              </option>
            ))}
          </select>
          <span>{props.year} AP</span>
        </div>
        <p className="Calendar__season">{props.seasonLine}</p>
      </div>
      <div className="Calendar__navButtons">
        <button
          type="button"
          aria-label="Previous month"
          onClick={props.onPrev}
        >
          {'< Prev'}
        </button>
        <button type="button" aria-label="Next month" onClick={props.onNext}>
          {'Next >'}
        </button>
        {props.showReturn && (
          <button type="button" onClick={props.onReturn}>
            Return to Today
          </button>
        )}
      </div>
    </header>
  );
};
