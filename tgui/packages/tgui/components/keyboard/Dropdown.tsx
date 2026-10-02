import {
  type ComponentProps,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Dropdown as CoreDropdown, Floating, Icon } from 'tgui-core/base-components';
import { classes } from 'tgui-core/react';
import { computeBoxProps, unit } from 'tgui-core/ui';

type Props = ComponentProps<typeof CoreDropdown>;
type Option = Props['options'][number];

function valueOf(option: Option | number) {
  return typeof option === 'object' ? option.value : option;
}

const menuKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'];

export function Dropdown(props: Props) {
  const {
    autoScroll = true, buttons, className, color = 'default', disabled,
    displayText, icon, iconRotation, iconSpin, iconOnly, menuWidth, noChevron,
    onClick, onSelected, options = [], over, placeholder = 'Select...', selected,
    fluid, width = 15, clipSelectedText, ...rest
  } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  const initialFocus = useRef(0);
  const search = useRef({ text: '', time: 0 });
  const menuId = useId();
  const selectedValue = selected == null ? undefined : valueOf(selected);
  const selectedIndex = options.findIndex((option) => valueOf(option) === selectedValue);
  openRef.current = open && !disabled;

  const trigger = () => rootRef.current?.querySelector<HTMLButtonElement>('.Dropdown__control');
  const entries = () => Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
  );

  function focusEntry(index: number) {
    const entry = entries()[index];
    if (entry) {
      entry.focus({ preventScroll: true });
      if (autoScroll) entry.scrollIntoView({ block: 'nearest' });
    } else {
      menuRef.current?.focus({ preventScroll: true });
    }
  }

  function close(returnFocus = false) {
    openRef.current = false;
    setOpen(false);
    search.current = { text: '', time: 0 };
    if (returnFocus) trigger()?.focus({ preventScroll: true });
  }

  function show(index = selectedIndex >= 0 ? selectedIndex : 0) {
    if (disabled) return;
    initialFocus.current = index;
    openRef.current = true;
    setOpen(true);
  }

  // Floating owns its trigger ref; find our trigger within the local root instead.
  const setMenu = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (node && openRef.current) {
      const entry = node.querySelectorAll<HTMLButtonElement>('[role="option"]')[initialFocus.current];
      (entry ?? node).focus({ preventScroll: true });
      if (autoScroll) entry?.scrollIntoView({ block: 'nearest' });
    }
  }, [autoScroll]);

  useEffect(() => {
    if (open && !disabled) focusEntry(initialFocus.current);
    if (disabled) close();
  }, [open, disabled]);

  useEffect(() => {
    if (!open) return;
    const document = rootRef.current?.ownerDocument;
    if (!document) return;
    const outsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const outsideFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', outsidePress, true);
    document.addEventListener('focusin', outsideFocus);
    return () => {
      document.removeEventListener('pointerdown', outsidePress, true);
      document.removeEventListener('focusin', outsideFocus);
    };
  }, [open]);

  function select(index: number) {
    if (disabled || index < 0 || index >= options.length) return;
    close(true);
    onSelected?.(valueOf(options[index]));
  }

  function cycle(direction: number) {
    if (disabled || !options.length) return;
    const index = selectedIndex < 0
      ? direction > 0 ? options.length - 1 : 0
      : (selectedIndex + direction + options.length) % options.length;
    onSelected?.(valueOf(options[index]));
    if (open && autoScroll) entries()[index]?.scrollIntoView({ block: 'nearest' });
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      disabled || !open || event.altKey || event.ctrlKey || event.metaKey ||
      (target !== event.currentTarget && target.getAttribute('role') !== 'option')
    ) return;
    if (event.key === 'Tab') {
      // Resume the normal document tab order from the trigger, not the portal.
      event.stopPropagation();
      close(true);
      return;
    }
    if (menuKeys.includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const list = entries();
      const current = list.indexOf(target as HTMLButtonElement);
      if (event.key === 'Escape') close(true);
      else if (event.key === 'Enter' || event.key === ' ') {
        if (!event.repeat) select(current);
      } else if (list.length) {
        const index = event.key === 'Home' ? 0
          : event.key === 'End' ? list.length - 1
            : (current + (event.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
        focusEntry(index);
      }
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      const key = event.key.toLocaleLowerCase();
      const previous = now - search.current.time < 700 ? search.current.text : '';
      const text = previous === key ? key : previous + key;
      search.current = { text, time: now };
      const list = entries();
      if (!list.length) return;
      const current = list.indexOf(target as HTMLButtonElement);
      for (let offset = text.length > 1 ? 0 : 1; offset <= list.length; offset++) {
        const index = (Math.max(current, 0) + offset) % list.length;
        if (list[index]?.textContent?.trim().toLocaleLowerCase().startsWith(text)) {
          focusEntry(index);
          break;
        }
      }
    }
  }

  function onMenuKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      (target === event.currentTarget || target.getAttribute('role') === 'option') &&
      !event.altKey && !event.ctrlKey && !event.metaKey &&
      (menuKeys.includes(event.key) || event.key.length === 1)
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <div
      {...computeBoxProps(rest)}
      ref={rootRef}
      className={classes(['Dropdown', 'KeyboardDropdown', fluid && 'Dropdown--fluid'])}
      onKeyDown={(event) => {
        rest.onKeyDown?.(event);
        if (!event.defaultPrevented && event.key === 'Tab' && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <Floating
        handleOpen={open && !disabled}
        onOpenChange={(next) => { if (!next) setOpen(false); }}
        disabled={disabled}
        placement={iconOnly ? over ? 'top-start' : 'bottom-start' : over ? 'top' : 'bottom'}
        contentAutoWidth={!menuWidth}
        contentClasses="Dropdown__menu--wrapper KeyboardDropdown__menu--wrapper"
        contentStyles={{ width: menuWidth ? unit(menuWidth) : undefined }}
        content={(
          <div
            className="Dropdown__menu"
            id={menuId}
            ref={setMenu}
            role="listbox"
            aria-label={typeof displayText === 'string' ? displayText : placeholder}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            onKeyUp={onMenuKeyUp}
          >
            {options.length ? options.map((option, index) => (
              <button
                type="button"
                role="option"
                key={valueOf(option)}
                tabIndex={-1}
                disabled={!open || !!disabled}
                aria-selected={selectedValue === valueOf(option)}
                className={classes(['Dropdown__menu--entry', selectedValue === valueOf(option) && 'selected'])}
                onClick={() => select(index)}
              >
                {typeof option === 'string' ? option : option.displayText}
              </button>
            )) : <div className="Dropdown__menu--entry">No options</div>}
          </div>
        )}
      >
        <button
          type="button"
          className={classes([
            'Dropdown__control', `Button--color--${color}`, disabled && 'Button--disabled',
            iconOnly && 'Dropdown__control--icon-only', className,
          ])}
          style={{ width: unit(width) }}
          disabled={!!disabled}
          aria-haspopup="listbox"
          aria-expanded={open && !disabled}
          aria-controls={open ? menuId : undefined}
          aria-label={iconOnly ? typeof displayText === 'string' ? displayText : placeholder : undefined}
          onClick={(event) => {
            if (disabled) return;
            onClick?.(event);
            if (open) close();
            else show();
          }}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || !menuKeys.includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') close();
            else if (event.key === 'Enter' || event.key === ' ') {
              if (!event.repeat) event.currentTarget.click();
            } else if (!open) {
              show(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : selectedIndex >= 0 ? selectedIndex : event.key === 'ArrowUp' ? options.length - 1 : 0);
            } else focusEntry(selectedIndex >= 0 ? selectedIndex : 0);
          }}
          onKeyUp={(event) => {
            if (menuKeys.includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {icon && <Icon className="Dropdown__icon" name={icon} rotation={iconRotation} spin={iconSpin} />}
          {!iconOnly && <>
            <span className="Dropdown__selected-text">{displayText ?? selectedValue ?? placeholder}</span>
            {!noChevron && <Icon className={classes(['Dropdown__icon', 'Dropdown__icon--arrow', over && 'over', open && 'open'])} name="chevron-down" />}
          </>}
        </button>
      </Floating>
      {buttons && [-1, 1].map((direction) => (
        <button
          type="button"
          key={direction}
          className={classes(['Button', 'Button--color--default', 'Button--empty', 'Button--hasIcon', 'Dropdown__button', disabled && 'Button--disabled'])}
          disabled={!!disabled}
          aria-label={direction < 0 ? 'Previous option' : 'Next option'}
          onClick={() => cycle(direction)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) event.currentTarget.click();
            }
          }}
          onKeyUp={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <div className="Button__content"><Icon className="Button--icon" name={direction < 0 ? 'chevron-left' : 'chevron-right'} /></div>
        </button>
      ))}
    </div>
  );
}
