import { useEffect, useRef, useState } from 'react';
import { useBackend } from 'tgui/backend';
import { Window } from 'tgui/layouts';
import { Autofocus, Box, Button, Input, Section, Stack } from 'tgui-core/components';
import { isAlphabetic, isNumeric, KEY } from 'tgui-core/keys';

import { InputButtons } from './common/InputButtons';
import { Loader } from './common/Loader';

type ListInputData = {
  enable_preview: boolean;
  init_value: string;
  items: string[];
  large_buttons: boolean;
  message: string;
  previewing: boolean;
  timeout: number;
  title: string;
};

export const ListInputModal = (props) => {
  const { act, data } = useBackend<ListInputData>();
  const {
    items = [],
    message = '',
    init_value,
    timeout,
    title,
    enable_preview,
    previewing,
  } = data;
  const [selection, setSelection] = useState(init_value);
  const [searchBarVisible, setSearchBarVisible] = useState(items.length > 8);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const selected = Math.max(0, filteredItems.indexOf(selection));
  const selectedItem = filteredItems[selected];
  const windowHeight = Math.min(
    640,
    200 + (searchBarVisible ? 42 : 0) +
      Math.min(8, Math.max(2, items.length)) * 44 +
      Math.min(100, Math.ceil(message.length / 55) * 22),
  );

  useEffect(() => {
    document.getElementById(`list-input-option-${selected}`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selected, searchQuery]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (key === KEY.Escape) {
      event.preventDefault();
      act('cancel');
      return;
    }
    // Footer controls keep their own Enter and Space actions.
    const target = event.target as HTMLElement;
    if (
      target.closest('.InputModal__footer') ||
      (target.closest('.Button') && !target.closest('.ListInput__option'))
    ) {
      return;
    }
    if (key === KEY.Down || key === KEY.Up) {
      event.preventDefault();
      if (filteredItems.length) {
        const direction = key === KEY.Down ? 1 : -1;
        const index =
          (selected + direction + filteredItems.length) % filteredItems.length;
        setSelection(filteredItems[index]);
      }
    } else if (key === KEY.Enter) {
      event.preventDefault();
      if (selectedItem !== undefined) {
        act('submit', { entry: selectedItem });
      }
    } else if (
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (isAlphabetic(key) || isNumeric(key)) &&
      event.target !== searchRef.current
    ) {
      event.preventDefault();
      if (searchBarVisible) {
        setSearchQuery(key);
        setSearchFocus((value) => value + 1);
      } else {
        const match = items.find((item) =>
          item.toLowerCase().startsWith(key.toLowerCase()),
        );
        if (match !== undefined) {
          setSelection(match);
        }
      }
    }
  }

  return (
    <Window title={title} width={500} height={windowHeight}>
      {!!timeout && <Loader value={timeout} />}
      <Window.Content className="InputModal" onKeyDown={handleKeyDown}>
        <Section className="ListInput__Section" fill>
          <Stack fill vertical>
            <Stack.Item>
              <Stack align="baseline">
                <Stack.Item grow>
                  <Box className="InputModal__prompt">{message}</Box>
                </Stack.Item>
                <Stack.Item>
                  <Button
                    className="ListInput__searchToggle"
                    icon="search"
                    selected={searchBarVisible}
                    tooltip={
                      searchBarVisible ? 'Hide search; use letters to jump to choices' : 'Search choices'
                    }
                    onClick={() => {
                      setSearchBarVisible(!searchBarVisible);
                      setSearchQuery('');
                    }}
                  >Search</Button>
                </Stack.Item>
              </Stack>
            </Stack.Item>
            {searchBarVisible ? (
              <Stack.Item>
                <Input
                  autoFocus
                  fluid
                  ref={searchRef}
                  key={searchFocus}
                  onChange={setSearchQuery}
                  placeholder="Search choices..."
                  value={searchQuery}
                />
              </Stack.Item>
            ) : <Autofocus />}
            <Stack.Item grow className="ListInput__choices">
              <Section fill scrollable>
                {filteredItems.length ? filteredItems.map((item, index) => (
                  <div key={index} onFocusCapture={() => setSelection(item)}>
                    <Button
                      className="ListInput__option"
                      color="transparent"
                      captureKeys={false}
                      fluid
                      id={`list-input-option-${index}`}
                      onClick={() => setSelection(item)}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        act('submit', { entry: item });
                      }}
                      selected={index === selected}
                    >
                      <span className="ListInput__marker" aria-hidden="true">
                        {index === selected ? '✓' : '◇'}
                      </span>
                      <span>{item.replace(/^\w/, (c) => c.toUpperCase())}</span>
                    </Button>
                  </div>
                )) : (
                  <Box className="ListInput__empty">No choices match your search.</Box>
                )}
              </Section>
            </Stack.Item>
            <Stack.Item>
              <Box className="InputModal__hint">
                {filteredItems.length} {filteredItems.length === 1 ? 'choice' : 'choices'}
                {' · '}↑ ↓ to navigate · Enter to confirm
              </Box>
            </Stack.Item>
            <Stack.Item className="InputModal__footer">
              <Stack align="center">
                {!!enable_preview && (
                  <Stack.Item>
                    <Button
                      className="InputModal__preview"
                      icon={previewing ? 'stop' : 'play'}
                      disabled={!previewing && selectedItem === undefined}
                      onClick={() => act('preview_toggle', {
                        entry: selectedItem ?? items[0],
                      })}
                    >
                      {previewing ? 'Stop' : 'Listen'}
                    </Button>
                  </Stack.Item>
                )}
                <Stack.Item grow>
                  <InputButtons
                    input={selectedItem}
                    disabled={selectedItem === undefined}
                  />
                </Stack.Item>
              </Stack>
            </Stack.Item>
          </Stack>
        </Section>
      </Window.Content>
    </Window>
  );
};

