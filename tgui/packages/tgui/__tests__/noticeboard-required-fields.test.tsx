import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PostingsTab } from '../interfaces/Noticeboard/PostingsTab';
import type { NoticeboardData } from '../interfaces/Noticeboard/types';

let container: HTMLDivElement;
let root: Root;
let send: ReturnType<typeof mock>;
let confirmPosting: ReturnType<typeof mock>;
let previousAct: PropertyDescriptor | undefined;
let previousConfirm: PropertyDescriptor | undefined;
let previousFocus: HTMLElement | null;

const initialData = (): NoticeboardData => ({
  realm_name: 'Rotwood Vale',
  postings: [],
  scout_regions: [],
  trade_orders: [],
  harbor_demands: [],
  charters: [],
  economic_events: [],
  mercenary_roster: {
    available: [],
    contracted: [],
    dnd: [],
    available_count: 0,
    contracted_count: 0,
    dnd_count: 0,
  },
  market_data: {
    categories: [],
    pop_snapshot: 0,
    category_count: 0,
    realm_demand_matrix: [],
  },
  can_post_listing: true,
  can_authority_remove: false,
  user_real_name: 'Scribe',
  user_default_name: 'Scribe',
  user_default_role: 'Clerk',
  has_active_notice: false,
  has_active_listing: false,
});

beforeEach(() => {
  previousAct = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  previousConfirm = Object.getOwnPropertyDescriptor(globalThis, 'confirm');
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  confirmPosting = mock(() => true);
  Reflect.set(globalThis, 'confirm', confirmPosting);
  send = mock();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  try {
    await act(async () => root.unmount());
  } finally {
    container.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
    for (const [key, descriptor] of [
      ['IS_REACT_ACT_ENVIRONMENT', previousAct],
      ['confirm', previousConfirm],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

const render = async (overrides: Partial<NoticeboardData> = {}) => {
  await act(async () =>
    root.render(
      <PostingsTab data={{ ...initialData(), ...overrides }} act={send} />,
    ),
  );
};
const button = (label: string) => {
  const element = [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  );
  if (!element) throw new Error(`Missing production ${label} button`);
  return element;
};
const click = async (label: string) => {
  await act(async () => button(label).click());
};
const fields = () => [
  ...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  ),
];
const values = () => fields().map((field) => field.value);
const edit = async (index: number, value: string) => {
  const element = fields()[index];
  if (!element) throw new Error(`Missing production field ${index}`);
  await act(async () => {
    element.focus();
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(fields()[index].value).toBe(value);
};
const openDraft = async (overrides: Partial<NoticeboardData> = {}) => {
  await render(overrides);
  await click('Make a Posting');
  await edit(0, 'A draft title');
  await edit(1, 'A draft body');
  await edit(2, 'A draft name');
  await edit(3, 'A draft role');
};
const expectPinned = async (tier = 'notice') => {
  const [title, body, poster_name, poster_title] = values();
  expect(button('Pin Posting').disabled).toBe(false);
  await click('Pin Posting');
  expect(send.mock.calls).toEqual([
    ['make_post', { tier, title, body, poster_name, poster_title }],
  ]);
  expect(fields()).toHaveLength(0);
  expect(button('Make a Posting')).toBeDefined();
};
const expectRetained = async () => {
  const draft = values();
  expect(button('Pin Posting').disabled).toBe(true);
  await click('Pin Posting');
  expect(send).not.toHaveBeenCalled();
  expect(confirmPosting).not.toHaveBeenCalled();
  expect(values()).toEqual(draft);
};

for (const [index, label] of ['title', 'body', 'signed name'].entries()) {
  test(`${label}: DM-trimmed empty text cannot send or discard a draft; correction can`, async () => {
    await openDraft();
    // text.dm trim removes U+0000–U+0020, not JavaScript's Unicode whitespace.
    for (const value of [
      '',
      ' ',
      '\t',
      '\u0000',
      '\u0001\u0008\u000b\u000c\u001f',
      ' \t \u001f ',
    ]) {
      await edit(index, value);
      await expectRetained();
    }
    await edit(index, 'Corrected text');
    await expectPinned();
  });

  test(`${label}: raw exact null cannot send or discard a draft`, async () => {
    await openDraft({ has_active_listing: true });
    await click('Standing Listing (no expiry)');
    await edit(index, 'null');
    await expectRetained();
    await edit(index, ' null ');
    await expectPinned('listing');
    expect(confirmPosting).toHaveBeenCalledTimes(1);
  });

  test(`${label}: padded null, case variants, and non-DM whitespace stay valid and unchanged`, async () => {
    await openDraft();
    for (const value of [
      ' null ',
      '\tnull\t',
      'NULL',
      'Null',
      'nullified',
      '!',
      '\u007f',
      '\u0085',
      '\u00a0',
      '\u1680',
      '\u2000',
      '\u2028',
      '\u202f',
      '\u3000',
      '\ufeff',
      ' Élodie 雪 ',
    ]) {
      await edit(index, value);
      expect(button('Pin Posting').disabled).toBe(false);
    }
    await expectPinned();
  });
}

test('multiline body uses the same required rule and preserves legitimate whitespace in the payload', async () => {
  await openDraft();
  await edit(1, '\n\t\n ');
  await expectRetained();
  await edit(0, '  A title  ');
  await edit(1, ' \nFirst line\n\nSecond line\t ');
  await edit(2, '  Élodie  ');
  await expectPinned();
});

for (const [index, maximum] of [50, 500, 50, 50].entries()) {
  test(`field ${index}: existing JavaScript length boundary ${maximum} stays unchanged`, async () => {
    await openDraft();
    await edit(index, 'x'.repeat(maximum + 1));
    await expectRetained();
    await edit(index, 'x'.repeat(maximum));
    await expectPinned();
  });
}

test('Unicode text keeps the existing JavaScript length policy, not a new byte limit', async () => {
  await openDraft();
  await edit(0, 'é'.repeat(50));
  await edit(2, '😀'.repeat(25));
  await expectPinned();
});

test('optional role remains optional and is not subjected to required-field rejection', async () => {
  await openDraft();
  for (const role of ['', ' ', '\t', 'null', '\u0001']) {
    await edit(3, role);
    expect(button('Pin Posting').disabled).toBe(false);
  }
  await edit(3, 'null');
  await expectPinned();
});

test('default names are validated too, without modifying the default role', async () => {
  await render({ user_default_name: 'null', user_default_role: 'null' });
  await click('Make a Posting');
  await edit(0, 'Title');
  await edit(1, 'Body');
  await expectRetained();
  await edit(2, 'Scribe');
  await expectPinned();
});

test('notice-only users retain their tier and replace notice without a listing confirmation', async () => {
  await openDraft({
    can_post_listing: false,
    has_active_notice: true,
    has_active_listing: true,
  });
  expect(container.textContent).not.toContain('Standing Listing (no expiry)');
  expect(container.textContent).toContain('You have a Notice already posted.');
  await expectPinned();
  expect(confirmPosting).not.toHaveBeenCalled();
});

test('listing confirmation refusal preserves the draft; approval sends the exact selected tier once', async () => {
  await openDraft({ has_active_notice: true, has_active_listing: true });
  await click('Standing Listing (no expiry)');
  expect(container.textContent).toContain(
    'You have a Standing Listing already posted.',
  );
  expect(container.textContent).not.toContain(
    'You have a Notice already posted.',
  );
  const draft = values();
  confirmPosting.mockReturnValueOnce(false);
  await click('Pin Posting');
  expect(send).not.toHaveBeenCalled();
  expect(values()).toEqual(draft);
  await expectPinned('listing');
  expect(confirmPosting.mock.calls).toEqual(
    Array(2).fill([
      'You already have a Standing Listing posted. Posting a new one will replace it. Proceed?',
    ]),
  );
});

test('switching back to notice preserves text and does not ask the listing confirmation', async () => {
  await openDraft({ has_active_notice: true, has_active_listing: true });
  const draft = values();
  await click('Standing Listing (no expiry)');
  await click('Notice (expires in 30m)');
  expect(values()).toEqual(draft);
  await expectPinned();
  expect(confirmPosting).not.toHaveBeenCalled();
});

for (const close of ['Cancel', 'Hide Form']) {
  test(`${close} still intentionally discards the draft and reopening restores defaults`, async () => {
    await openDraft();
    await edit(0, 'null');
    await click(close);
    expect(fields()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    await click('Make a Posting');
    expect(values()).toEqual(['', '', 'Scribe', 'Clerk']);
    expect(button('Pin Posting').disabled).toBe(true);
  });
}

test('required-text policy stays bound to the server sanitizer and trim implementation', () => {
  const repoRoot = resolve(import.meta.dir, '../../../..');
  const noticeboard = readFileSync(
    resolve(
      repoRoot,
      'code/modules/roguetown/roguemachine/noticeboard/noticeboard.dm',
    ),
    'utf8',
  );
  const textHelpers = readFileSync(
    resolve(repoRoot, 'code/__HELPERS/text.dm'),
    'utf8',
  );
  // Compare only the relevant procs, ignoring comment lines and whitespace
  // outside string literals. Literal whitespace is part of this contract.
  const proc = (source: string, path: string) => {
    const start = source.search(new RegExp(`^${path}\\s*\\(`, 'm'));
    if (start < 0) throw new Error(`Missing server proc ${path}`);
    return (
      source
        .slice(start)
        .split(/\r?\n(?=\/(?!\/))/)[0]
        .replace(/^\s*\/\/.*$/gm, '')
        // Retain quoted DM text, including escaped quotes and literal whitespace.
        .replace(/"(?:\\.|[^"\\])*"|\s+/g, (token) =>
          token.startsWith('"') ? token : '',
        )
    );
  };
  const boardPath = '/obj/structure/roguemachine/noticeboard/proc/';
  expect(proc(noticeboard, `${boardPath}sanitize_input`)).toBe(
    `${boardPath}sanitize_input(text,max_length,multiline=FALSE)` +
      'if(!text||text=="null")returnnull' +
      'text=copytext(text,1,max_length+1)' +
      'text=trim(text)' +
      'if(!length(text))returnnull' +
      'returntext',
  );
  // Negative mutations guard the normalizer itself: these meaningful changes
  // must not disappear merely because both contain literal spaces.
  const sanitizer = proc(noticeboard, `${boardPath}sanitize_input`);
  expect(
    proc(
      sanitizer.replace('text=="null"', 'text==" null "'),
      `${boardPath}sanitize_input`,
    ),
  ).not.toBe(sanitizer);
  for (const path of ['/proc/trim_left', '/proc/trim_right']) {
    const original = proc(textHelpers, path);
    expect(proc(original.replace('return""', 'return" "'), path)).not.toBe(
      original,
    );
  }
  const makePost = proc(noticeboard, `${boardPath}handle_make_post`);
  for (const [field, maximum, extra] of [
    ['title', 'TITLE', ''],
    ['body', 'BODY', ',multiline=TRUE'],
    ['poster_name', 'NAME', ''],
  ]) {
    expect(makePost).toContain(
      `var/${field}=sanitize_input("[params["${field}"]]",NOTICEBOARD_${maximum}_MAX_LENGTH${extra})`,
    );
  }
  expect(makePost).toContain('if(!title||!body||!poster_name)');
  expect(proc(textHelpers, '/proc/trim_left')).toBe(
    '/proc/trim_left(text)' +
      'for(var/i=1tolength(text))' +
      'if(text2ascii(text,i)>32)returncopytext(text,i)' +
      'return""',
  );
  expect(proc(textHelpers, '/proc/trim_right')).toBe(
    '/proc/trim_right(text)' +
      'for(var/i=length(text),i>0,i--)' +
      'if(text2ascii(text,i)>32)returncopytext(text,1,i+1)' +
      'return""',
  );
  expect(proc(textHelpers, '/proc/trim')).toBe(
    '/proc/trim(text,max_length)' +
      'if(max_length)text=copytext(text,1,max_length)' +
      'returntrim_left(trim_right(text))',
  );
});
