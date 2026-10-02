import type { ComponentProps } from 'react';
import {
  Button as CoreButton,
  ImageButton as CoreImageButton,
} from 'tgui-core/base-components';

function ButtonInput(props: ComponentProps<typeof CoreButton.Input>) {
  return (
    <CoreButton.Input
      {...props}
      {...{ role: 'button', tabIndex: props.disabled ? -1 : 0, 'aria-disabled': !!props.disabled }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        const control = event.currentTarget as HTMLElement;
        if (event.target !== control) {
          // The editor already owns Enter/Escape; return to its button afterward.
          if (event.defaultPrevented && (event.key === 'Enter' || event.key === 'Escape')) {
            event.stopPropagation();
            requestAnimationFrame(() => control.isConnected && control.focus());
          }
          return;
        }
        if (!event.defaultPrevented && !props.disabled && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          if (!event.repeat) control.click();
        }
      }}
    />
  );
}

export const Button = Object.assign(
  (props: ComponentProps<typeof CoreButton>) => <CoreButton {...{ role: 'button' }} {...props} />,
  {
    Checkbox: CoreButton.Checkbox,
    Confirm: CoreButton.Confirm,
    File: CoreButton.File,
    Input: ButtonInput,
  },
);

export function ImageButton(props: ComponentProps<typeof CoreImageButton>) {
  return (
    <CoreImageButton
      {...props}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        const target = event.target as HTMLElement;
        if (event.defaultPrevented || props.disabled || event.altKey || event.ctrlKey || event.metaKey || !target.classList.contains('ImageButton__container')) return;
        if (event.key === ' ') {
          event.preventDefault();
          if (!event.repeat) props.onClick?.(event);
        } else if (event.key === 'Enter') {
          // Upstream already activated Enter; keep a parent from activating again.
          event.preventDefault();
        }
      }}
    />
  );
}
