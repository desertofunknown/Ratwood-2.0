import type { ReactNode } from 'react';

export const SequesteredOverlay = (props: {
  active: boolean;
  label: string;
  children: ReactNode;
}) => (
  <div className="StewardSequestration">
    {props.active && (
      <p className="StewardSequestration__notice" role="status">
        <strong>Sequestered.</strong> {props.label} held by the Ferentian
        Trading Company.
      </p>
    )}
    <fieldset
      disabled={props.active}
      className="StewardSequestration__controls"
      aria-label={props.label}
    >
      {props.children}
    </fieldset>
  </div>
);
