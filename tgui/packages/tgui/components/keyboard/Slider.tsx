import type { ComponentProps } from 'react';
import { Slider as CoreSlider } from 'tgui-core/base-components';

const adjustmentKeys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End', 'PageUp', 'PageDown'];

export function Slider(props: ComponentProps<typeof CoreSlider>) {
  const { disabled, value, minValue, maxValue, step = 1 } = props;
  return (
    <CoreSlider
      {...props}
      {...{
        role: 'slider', tabIndex: disabled ? -1 : 0, 'aria-disabled': !!disabled,
        'aria-valuenow': value, 'aria-valuemin': minValue, 'aria-valuemax': maxValue,
        'aria-valuetext': props.format ? props.format(value) : undefined,
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented || disabled || event.target !== event.currentTarget ||
          event.altKey || event.ctrlKey || event.metaKey || !adjustmentKeys.includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const amount = event.key === 'PageUp' || event.key === 'PageDown' ? step * 10 : step;
        let next = event.key === 'Home' ? minValue : event.key === 'End' ? maxValue
          : value + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? amount : -amount);
        // Decimal steps such as line-height's 0.01 should not accumulate binary noise.
        next = Math.min(maxValue, Math.max(minValue, Number(next.toPrecision(12))));
        if (next !== value) {
          props.onChange?.(event.nativeEvent, next);
          props.onDrag?.(event.nativeEvent, next);
        }
      }}
      onKeyUp={(event) => {
        props.onKeyUp?.(event);
        if (event.target === event.currentTarget && !event.altKey && !event.ctrlKey &&
          !event.metaKey && adjustmentKeys.includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    />
  );
}
