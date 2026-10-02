/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { useEffect, useRef } from 'react';
import { useBackend } from 'tgui/backend';
import type { Box } from 'tgui-core/components';
import { addScrollableNode, removeScrollableNode } from 'tgui-core/events';
import { classes } from 'tgui-core/react';
import { computeBoxClassName, computeBoxProps } from 'tgui-core/ui';

type BoxProps = React.ComponentProps<typeof Box>;

type Props = Partial<{
  theme: string;
}> &
  BoxProps;

const PARCHMENT_VARIANTS: Record<string, (cfg: any) => string> = {
  parchment: (cfg) => {
    const skin = cfg?.window?.parchment_skin;
    if (skin === 'leatherbound') return 'parchment-leatherbound';
    if (skin === 'vellum') return 'parchment-vellum';
    return 'parchment';
  },
};

export function Layout(props: Props) {
  const { className, theme = 'azure_default', children, ...rest } = props;
  const { config } = useBackend();

  const resolveVariant = PARCHMENT_VARIANTS[theme];
  const resolvedTheme = resolveVariant ? resolveVariant(config) : theme;

  const themeClass = `theme-${resolvedTheme}`;
  
  useEffect(() => {
    document.documentElement.className = themeClass;
  }, [themeClass]);

  return (
    <div className={themeClass}>
      <div
        className={classes(['Layout', className, computeBoxClassName(rest)])}
        {...computeBoxProps(rest)}
      >
        {children}
      </div>
    </div>
  );
}

type ContentProps = Partial<{
  scrollable: boolean;
}> &
  BoxProps;

function LayoutContent(props: ContentProps) {
  const { className, scrollable, children, onKeyDown, onKeyUp, ...rest } = props;
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const self = node.current;

    if (self && scrollable) {
      addScrollableNode(self);
    }
    return () => {
      if (self && scrollable) {
        removeScrollableNode(self);
      }
    };
  }, []);

  return (
    <div
      className={classes([
        'Layout__content',
        scrollable && 'Layout__content--scrollable',
        className,

        computeBoxClassName(rest),
      ])}
      ref={node}
      tabIndex={scrollable ? 0 : undefined}
      {...computeBoxProps(rest)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (scrollable && event.target === event.currentTarget &&
          ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
          // Let the browser scroll without forwarding diagonal movement to BYOND.
          event.stopPropagation();
        }
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (scrollable && event.target === event.currentTarget &&
          ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}

Layout.Content = LayoutContent;
