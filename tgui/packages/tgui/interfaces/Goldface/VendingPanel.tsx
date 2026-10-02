import { useEffect, useRef, useState } from 'react';

import { PacksGrid } from './PacksGrid';
import { SearchBar } from './SearchBar';
import type { ActFn, VendingData } from './types';

export const VendingPanel = (props: { data: VendingData; act: ActFn }) => {
  const { data, act } = props;
  const initializedCategory = useRef(false);
  const [searchReset, setSearchReset] = useState(0);
  const locked = !!data.locked;
  const privateLocked = locked && !data.is_public;
  const inSearchMode = !!data.search_mode;

  useEffect(() => {
    if (initializedCategory.current || privateLocked || !data.categories.length) return;
    initializedCategory.current = true;
    if (!data.current_category && !data.search) {
      setSearchReset((value) => value + 1);
      act('changecat', { category: data.categories[0] });
    }
  }, [act, privateLocked, data.categories, data.current_category, data.search]);

  if (privateLocked) {
    return <p className="Goldface__notice">This counter is locked.</p>;
  }

  return (
    <div className="Goldface__shop">
      <nav className="Goldface__categories" aria-label="Goods categories">
        {data.categories.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={!inSearchMode && data.current_category === category}
            onClick={() => {
              setSearchReset((value) => value + 1);
              act('changecat', { category });
            }}
          >
            {category}
          </button>
        ))}
      </nav>
      <main className="Goldface__goods">
        {locked && <p className="Goldface__notice">This counter is locked. Stock is available to browse.</p>}
        <div className="Goldface__toolbar">
          <div className="Goldface__listHeading">
            <h2>{inSearchMode ? 'Search results' : data.current_category || 'Goods'}</h2>
            <span>({data.packs.length})</span>
          </div>
          <SearchBar serverSearch={data.search} searchRevision={data.search_revision} resetKey={searchReset} act={act} />
        </div>
        <PacksGrid
          packs={data.packs}
          budget={data.budget}
          canRead={!!data.can_read}
          inSearchMode={inSearchMode}
          serverSearch={data.search}
          hasCategory={!!data.current_category}
          browseOnly={locked}
          resultCap={data.result_cap}
          totalMatches={data.total_matches}
          act={act}
        />
      </main>
    </div>
  );
};
