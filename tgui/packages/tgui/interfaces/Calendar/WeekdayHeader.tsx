type Props = { names: string[] };
export const WeekdayHeader = ({ names }: Props) => (
  <div
    className="Calendar__weekdays"
    style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}
  >
    {names.map((name) => (
      <span key={name}>
        <span className="Calendar__weekdayFull">{name}</span>
        <abbr className="Calendar__weekdayShort" title={name}>
          {name.slice(0, 3)}
        </abbr>
      </span>
    ))}
  </div>
);
