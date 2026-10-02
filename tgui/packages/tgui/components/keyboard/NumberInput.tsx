import { cloneElement, type KeyboardEvent } from 'react';
import { NumberInput as CoreNumberInput } from 'tgui-core/base-components';

export class NumberInput extends CoreNumberInput {
  handleControlKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const control = event.currentTarget;
    if (event.target !== control) {
      if (event.target === this.inputRef.current && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault();
        event.stopPropagation();
        this.setState({}, () => control.isConnected && control.focus());
      }
      return;
    }
    this.props.onKeyDown?.(event);
    if (event.defaultPrevented || this.props.disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const value = Number.parseFloat(String(this.props.value));
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      this.setState({ editing: true, currentValue: value, previousValue: value }, () => {
        const input = this.inputRef.current;
        if (input) {
          input.value = String(value);
          input.focus();
          input.select();
        }
      });
      return;
    }
    const { minValue, maxValue, step, onChange, onDrag } = this.props;
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = value + step;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = value - step;
        break;
      case 'Home':
        next = minValue;
        break;
      case 'End':
        next = maxValue;
        break;
      default:
        return;
    }
    event.preventDefault();
    next = Math.min(maxValue, Math.max(minValue, next));
    if (!Number.isFinite(next) || next === value) return;
    this.setState({ currentValue: next, previousValue: next });
    onChange?.(next);
    onDrag?.(next);
  };

  render() {
    return cloneElement(super.render(), {
      role: 'spinbutton',
      tabIndex: this.props.disabled || this.state.editing ? -1 : 0,
      'aria-disabled': !!this.props.disabled,
      'aria-valuenow': Number.parseFloat(String(this.props.value)),
      'aria-valuemin': Number.isFinite(this.props.minValue) ? this.props.minValue : undefined,
      'aria-valuemax': Number.isFinite(this.props.maxValue) ? this.props.maxValue : undefined,
      onKeyDown: this.handleControlKeyDown,
      onKeyUp: (event: KeyboardEvent<HTMLDivElement>) => {
        this.props.onKeyUp?.(event);
        if (event.target === event.currentTarget && (event.key === 'Home' || event.key === 'End')) event.preventDefault();
      },
    });
  }
}
