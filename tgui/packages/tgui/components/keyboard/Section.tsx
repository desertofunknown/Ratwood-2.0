import { type ComponentProps, useLayoutEffect, useRef } from 'react';
import { Section as CoreSection } from 'tgui-core/base-components';

export function Section(props: ComponentProps<typeof CoreSection>) {
  const localRef = useRef<HTMLDivElement>(null);
  const contentRef = props.ref ?? localRef;
  const scrollable = props.scrollable || props.scrollableHorizontal;
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !scrollable) return;
    const previous = content.getAttribute('tabindex');
    content.tabIndex = 0;
    return () => {
      if (previous === null) content.removeAttribute('tabindex');
      else content.setAttribute('tabindex', previous);
    };
  }, [contentRef, scrollable]);
  return (
    <CoreSection
      {...props}
      ref={contentRef}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (scrollable && event.target === contentRef.current &&
          ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
      }}
      onKeyUp={(event) => {
        props.onKeyUp?.(event);
        if (scrollable && event.target === contentRef.current &&
          ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
      }}
    />
  );
}
