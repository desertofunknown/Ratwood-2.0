import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  FONT_BODY,
  INK,
  INK_SOFT,
  inkButtonStyle,
  SERIF,
} from '../common/parchment';
import type { ActFn } from './types';

type Props = {
  serverSearch: string;
  searchRevision: number;
  resetKey?: number;
  act: ActFn;
};

export const SearchBar = (props: Props) => {
  const { serverSearch, searchRevision, resetKey = 0, act } = props;
  const [draft, setDraft] = useState(serverSearch);
  const dispatch = useRef(act);
  dispatch.current = act;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intent = useRef(0);
  const submitted = useRef<{ query: string; intent: number; revision: number }[]>([]);
  const lastReset = useRef(resetKey);
  const lastServer = useRef({ query: serverSearch, revision: searchRevision });

  const cancelPending = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };

  const rememberSubmission = (query: string, nextIntent: number) => {
    const pending = submitted.current;
    const revision = Math.max(
      lastServer.current.revision,
      pending[pending.length - 1]?.revision ?? 0,
    ) + 1;
    pending.push({ query, intent: nextIntent, revision });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    cancelPending();
    rememberSubmission('', ++intent.current);
    setDraft('');
  }, [resetKey]);

  useLayoutEffect(() => {
    const previous = lastServer.current;
    if (searchRevision < previous.revision ||
        (serverSearch === previous.query && searchRevision === previous.revision)) return;
    lastServer.current = { query: serverSearch, revision: searchRevision };

    // Updates can acknowledge an earlier search after the player has typed again.
    let matched = -1;
    for (let i = 0; i < submitted.current.length; i++) {
      const entry = submitted.current[i];
      if (entry.query === serverSearch && entry.revision <= searchRevision) matched = i;
    }
    if (matched >= 0) {
      const acknowledged = submitted.current[matched];
      submitted.current.splice(0, matched + 1);
      if (acknowledged.intent < intent.current) return;
    } else if (timer.current !== undefined) {
      return;
    }
    setDraft(serverSearch);
  }, [serverSearch, searchRevision]);

  const changeSearch = (query: string) => {
    cancelPending();
    setDraft(query);
    const nextIntent = ++intent.current;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      rememberSubmission(query, nextIntent);
      dispatch.current('set_search', { search: query });
    }, 250);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <label
        htmlFor="goods-search"
        style={{
          fontFamily: SERIF,
          fontSize: FONT_BODY,
          color: INK_SOFT,
        }}
      >
        Find
      </label>
      <input
        id="goods-search"
        type="search"
        value={draft}
        onChange={(event) => changeSearch(event.currentTarget.value)}
        placeholder="Search all goods..."
        style={{ flex: '1 1 120px', minWidth: 0, padding: '4px 7px', color: INK, background: 'var(--p-bg)', border: '1px solid var(--p-bg-shadow)', fontSize: FONT_BODY }}
      />
      {!!draft && (
        <button
          type="button"
          style={inkButtonStyle()}
          onClick={() => {
            cancelPending();
            rememberSubmission('', ++intent.current);
            setDraft('');
            act('clear_search');
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
};
