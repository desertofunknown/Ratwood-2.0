/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { useRef } from 'react';
import { useDispatch, useSelector } from 'tgui/backend';
import { Box, Button, Tabs } from 'tgui-core/components';

import { openChatSettings } from '../settings/actions';
import { addChatPage, changeChatPage, removeChatPage } from './actions';
import { selectChatInitialized, selectChatPages, selectCurrentChatPage } from './selectors';

function UnreadCountWidget({ value }: { value: number }) {
  return <Box className="UnreadCount">{Math.min(value, 99)}</Box>;
}

export function ChatTabs(props) {
  const pages = useSelector(selectChatPages);
  const currentPage = useSelector(selectCurrentChatPage);
  const initialized = useSelector(selectChatInitialized);
  const dispatch = useDispatch();
  const tabsRef = useRef<HTMLDivElement>(null);

  return (
    <div className="ChatTabs" ref={tabsRef}>
      <Tabs className="ChatTabs__list" textAlign="center">
        {pages.map((page) => (
          <div className="ChatTabs__page" key={page.id}>
            <Tabs.Tab
              selected={page.id === currentPage.id}
              disabled={!initialized}
              {...{ title: page.name }}
              onClick={() => dispatch(changeChatPage({ pageId: page.id }))}
            >
              {page.name}
              {!page.hideUnreadCount && page.unreadCount > 0 && (
                <UnreadCountWidget value={page.unreadCount} />
              )}
            </Tabs.Tab>
            {!page.isMain && (
              <button
                type="button"
                className="ChatTabs__close"
                disabled={!initialized}
                aria-label={`Close chat tab ${page.name}`}
                title={`Close chat tab ${page.name}`}
                onClick={() => {
                  dispatch(removeChatPage({ pageId: page.id }));
                  requestAnimationFrame(() => {
                    tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
                  });
                }}
              >×</button>
            )}
          </div>
        ))}
      </Tabs>
      <Button
        className="ChatTabs__add"
        color="transparent"
        icon="plus"
        disabled={!initialized}
        tooltip={initialized ? 'New chat tab' : 'Loading chat tabs…'}
        onClick={(event) => {
          if ('repeat' in event && event.repeat) return;
          dispatch(addChatPage());
          dispatch(openChatSettings());
          requestAnimationFrame(() => {
            const name = document.getElementById('chat-tab-name') as HTMLInputElement | null;
            name?.focus();
            name?.select();
          });
        }}
      />
    </div>
  );
}
