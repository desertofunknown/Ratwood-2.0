/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import {
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Box } from 'tgui-core/components';
import { UI_DISABLED, UI_INTERACTIVE } from 'tgui-core/constants';
import { type BooleanLike, classes } from 'tgui-core/react';
import { decodeHtmlEntities } from 'tgui-core/string';

import {
  backendSuspendStart,
  globalStore,
  selectBackend,
  useBackend,
} from '../backend';
import { useDebug } from '../debug';
import {
  cancelWindowInteraction,
  dragStartHandler,
  recallWindowGeometry,
  resizeStartHandler,
  setWindowKey,
} from '../drag';
import { createLogger } from '../logging';
import { Layout } from './Layout';
import { TitleBar } from './TitleBar';

const logger = createLogger('Window');
const DEFAULT_SIZE: [number, number] = [400, 600];

type Props = Partial<{
  buttons: ReactNode;
  canClose: BooleanLike;
  height: number;
  theme: string;
  title: string;
  width: number;
}> &
  PropsWithChildren;

export const Window = (props: Props) => {
  const {
    canClose = true,
    theme,
    title,
    children,
    buttons,
    width,
    height,
  } = props;

  const { config, suspended, suspending } = useBackend();
  const { debugLayout = false } = useDebug();
  const [isReadyToRender, setIsReadyToRender] = useState(false);
  const visible = useRef(false);

  // We need to set the window to be invisible before we can set its geometry
  // Otherwise, we get a flicker effect when the window is first rendered
  useLayoutEffect(() => {
    Byond.winset(Byond.windowId, {
      'is-visible': false,
    });
    setIsReadyToRender(true);
  }, []);

  const { scale, fancy, locked, key } = config.window || {};

  useEffect(() => {
    if (suspended) {
      visible.current = false;
    }
    if (suspended || suspending || !isReadyToRender) {
      return;
    }
    let cancelled = false;
    const isCancelled = () => {
      const state = selectBackend(globalStore.getState());
      return Boolean(cancelled || state.suspended || state.suspending);
    };
    setWindowKey(key || Byond.windowId);
    const updateGeometry = async () => {
      const applied = await recallWindowGeometry(
        {
          fancy,
          locked,
          scale,
          size: width && height ? [width, height] : DEFAULT_SIZE,
        },
        isCancelled,
      );
      if (!applied || isCancelled()) {
        return;
      }
      // Let the native resize settle before exposing the browser surface.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (isCancelled()) {
        return;
      }
      Byond.winset(Byond.windowId, { 'is-visible': true });
      if (!visible.current) {
        visible.current = true;
        Byond.sendMessage('visible');
      }
      logger.log('set to visible');
    };
    updateGeometry();
    return () => {
      cancelled = true;
      cancelWindowInteraction();
    };
  }, [
    isReadyToRender,
    suspended,
    suspending,
    width,
    height,
    scale,
    fancy,
    locked,
    key,
  ]);

  useEffect(() => {
    if (!suspended && isReadyToRender) {
      Byond.winset(Byond.windowId, { 'can-close': Boolean(canClose) });
    }
  }, [canClose, suspended, isReadyToRender]);

  const dispatch = globalStore.dispatch;

  // Determine when to show dimmer
  const showDimmer =
    config.user &&
    (config.user.observer
      ? config.status < UI_DISABLED
      : config.status < UI_INTERACTIVE);
  return suspended ? null : (
    <Layout className="Window" theme={theme || config.window?.theme}>
      <TitleBar
        title={title || decodeHtmlEntities(config.title)}
        status={config.status}
        fancy={fancy}
        onDragStart={dragStartHandler}
        onClose={() => {
          logger.log('pressed close');
          dispatch(backendSuspendStart());
        }}
        canClose={canClose}
      >
        {buttons}
      </TitleBar>
      <div className={classes(['Window__rest', debugLayout && 'debug-layout'])}>
        {!suspended && children}
        {showDimmer && <div className="Window__dimmer" />}
      </div>
      {fancy && (
        <>
          <div
            className="Window__resizeHandle__e"
            onMouseDown={resizeStartHandler(1, 0)}
          />
          <div
            className="Window__resizeHandle__s"
            onMouseDown={resizeStartHandler(0, 1)}
          />
          <div
            className="Window__resizeHandle__se"
            onMouseDown={resizeStartHandler(1, 1)}
          />
        </>
      )}
    </Layout>
  );
};

type ContentProps = Partial<{
  className: string;
  fitted: boolean;
  scrollable: boolean;
  vertical: boolean;
}> &
  ComponentProps<typeof Box> &
  PropsWithChildren;

const WindowContent = (props: ContentProps) => {
  const { className, fitted, children, ...rest } = props;

  return (
    <Layout.Content
      className={classes(['Window__content', className])}
      {...rest}
      
    >
      {(fitted && children) || (
        <div className="Window__contentPadding">{children}</div>
      )}
    </Layout.Content>
  );
};

Window.Content = WindowContent;
