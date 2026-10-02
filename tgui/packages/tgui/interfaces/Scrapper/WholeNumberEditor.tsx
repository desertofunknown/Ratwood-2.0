import { useEffect, useId, useState } from 'react';

import type { MaterialRow, ScrapperAct } from './types';

export const WholeNumberEditor = ({
  row,
  field,
  act,
}: {
  row: MaterialRow;
  field: 'price' | 'cap';
  act: ScrapperAct;
}) => {
  const id = useId();
  const serverValue = row[field];
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(serverValue);
  const value = Number(text);
  const valid = /^\d+$/.test(text) && Number.isSafeInteger(value);
  const dirty = valid && value !== serverValue;
  // Clean fields follow live prices; acknowledgements release the local draft.
  useEffect(() => {
    if (draft !== null && valid && value === serverValue) setDraft(null);
  }, [draft, valid, value, serverValue]);
  const label = field === 'price' ? 'Price' : 'Cap';
  return (
    <form
      className="Scrapper__editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) act(`set_${field}`, { path: row.path, value });
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        aria-label={`${row.name} ${label.toLowerCase()}`}
        aria-invalid={!valid}
        aria-describedby={!valid ? id : undefined}
        title={
          field === 'cap'
            ? 'Whole material units; 0 means no cap.'
            : 'Whole mammon per material unit.'
        }
        value={text}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" disabled={!dirty}>
        {label}
      </button>
      {!valid && (
        <small id={id} className="Scrapper__bad">
          Enter a whole, non-negative number.
        </small>
      )}
    </form>
  );
};
