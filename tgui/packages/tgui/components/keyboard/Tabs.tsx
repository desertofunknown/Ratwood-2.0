import type { ComponentProps, KeyboardEvent } from 'react';
import { Tabs as CoreTabs } from 'tgui-core/base-components';

type TabsProps = ComponentProps<typeof CoreTabs>;
type TabProps = ComponentProps<typeof CoreTabs.Tab> & {
  disabled?: boolean;
  tabIndex?: number;
};

function navigationKeys(vertical?: boolean) {
  return vertical
    ? ['ArrowUp', 'ArrowDown', 'Home', 'End']
    : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
}

export function Tabs(props: TabsProps) {
  const { onKeyDown, onKeyUp, vertical, ...rest } = props;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !navigationKeys(vertical).includes(event.key)
    ) {
      return;
    }
    const target = event.target as HTMLElement;
    const list = event.currentTarget;
    if (target.getAttribute('role') !== 'tab' || target.closest('[role="tablist"]') !== list) {
      return;
    }
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
      (tab) => tab.closest('[role="tablist"]') === list &&
        tab.getAttribute('aria-disabled') !== 'true' && tab.getClientRects().length,
    );
    const index = tabs.indexOf(target);
    if (index < 0 || !tabs.length) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + tabs.length) % tabs.length;
    tabs[next].focus();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyUp?.(event);
    const target = event.target as HTMLElement;
    if (
      target.getAttribute('role') === 'tab' &&
      target.closest('[role="tablist"]') === event.currentTarget &&
      !event.altKey && !event.ctrlKey && !event.metaKey &&
      navigationKeys(vertical).includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <CoreTabs
      {...rest}
      {...{ role: 'tablist', 'aria-orientation': vertical ? 'vertical' : 'horizontal' }}
      vertical={vertical}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    />
  );
}

function Tab(props: TabProps) {
  const { disabled, tabIndex, onClick, onKeyDown, onKeyUp, ...rest } = props;
  return (
    <CoreTabs.Tab
      {...rest}
      {...{
        role: 'tab',
        tabIndex: disabled ? -1 : tabIndex ?? 0,
        'aria-selected': !!props.selected,
        'aria-disabled': !!disabled,
      }}
      onClick={(event) => { if (!disabled) onClick?.(event); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.target !== event.currentTarget || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey ||
          (event.key !== 'Enter' && event.key !== ' ')
        ) return;
        event.preventDefault();
        event.stopPropagation();
        if (!disabled && !event.repeat) event.currentTarget.click();
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    />
  );
}

Tabs.Tab = Tab;
