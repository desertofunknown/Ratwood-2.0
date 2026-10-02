import {
  FONT_BODY,
  INK_SOFT,
  SERIF,
} from '../common/parchment';
import { PackRow } from './PackRow';
import type { ActFn, VendingPack } from './types';

type Props = {
  packs: VendingPack[];
  budget: number;
  canRead: boolean;
  inSearchMode: boolean;
  serverSearch: string;
  hasCategory: boolean;
  browseOnly: boolean;
  resultCap: number;
  totalMatches: number;
  act: ActFn;
};

const StockNotice = (props: { children: React.ReactNode }) => (
  <p className="Goldface__notice">
    {props.children}
  </p>
);

export const PacksGrid = (props: Props) => {
  const {
    packs,
    budget,
    canRead,
    inSearchMode,
    serverSearch,
    hasCategory,
    browseOnly,
    resultCap,
    totalMatches,
    act,
  } = props;

  if (!hasCategory && !inSearchMode) {
    return (
      <StockNotice>
        Choose a category or search to find goods.
      </StockNotice>
    );
  }
  if (packs.length === 0) {
    return (
      <StockNotice>
        {inSearchMode
          ? `No goods match "${serverSearch}".`
          : 'No goods stocked in this category.'}
      </StockNotice>
    );
  }

  const overflowed = inSearchMode && totalMatches > resultCap;
  return (
    <>
      <div className="Goldface__stock">
        {packs.map((p) => (
          <div key={p.ref} className="Goldface__item">
            <PackRow
              pack={p}
              budget={budget}
              canRead={canRead}
              showCategory={inSearchMode}
              browseOnly={browseOnly}
              act={act}
            />
          </div>
        ))}
      </div>
      {overflowed && (
        <div
          style={{
            marginTop: '8px',
            textAlign: 'center',
            fontFamily: SERIF,
            fontSize: FONT_BODY,
            color: INK_SOFT,
          }}
        >
          Showing {resultCap} of {totalMatches} matches. Refine your search to
          narrow the list.
        </div>
      )}
    </>
  );
};
