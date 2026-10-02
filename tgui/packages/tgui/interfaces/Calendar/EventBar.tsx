type EventBarProps = {
  color: string;
  isStart: boolean;
  isEnd: boolean;
  label: string;
};
export const EventBar = ({ color, isStart, isEnd, label }: EventBarProps) => (
  <span
    className={`Calendar__ribbon${isStart ? ' Calendar__ribbon--start' : ''}${isEnd ? ' Calendar__ribbon--end' : ''}`}
    style={{ backgroundColor: color || undefined }}
    title={label}
  >
    {isStart ? label : '\u00a0'}
  </span>
);
