import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { EconomicChronicleData, TreasurySnapshot } from '../interfaces/EconomicChronicle/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'economic-chronicle' });
const backend = await import('../backend');
const { EconomicChronicleContent } = await import('../interfaces/EconomicChronicle/EconomicChronicleContent');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

// Matches the static snapshot fields emitted by economic_chronicle.dm.
const chronicleData = (): EconomicChronicleData => ({
  treasury_balance: 1275,
  treasury: {
    starting: 1000, rural_taxes: 200,
    poll: { total: 100, noble: 10, clergy: 10, inquisition: 10, courtier: 10,
      garrison: 10, guilds: 10, merchant: 10, burgher: 10, adventurer: 10,
      mercenary: 10, peasant: 0 },
    royal: { total: 180, contract_levy: 50, headeater_levy: 20, import_tariff: 30,
      export_duty: 40, recovered_spoils: 35, other_fees: 5 },
    exempt: { total: 21, contract: 1, headeater: 2, import: 3, export: 4, fines: 5, poll_tax: 6 },
    fines_income: 20, stockpile_exports: 300, stockpile_revenue: 100,
    stockpile_direct_imports: 12,
    standing: { revenue: 50, fulfilled: 2, expired: 1, petitioned: 1, petition_pledge_spent: 4 },
    shortages_ended: 1, wages_paid: 500, treasury_transfers: 20, stockpile_imports: 150,
    banditry_losses: 5, banditry_owed: 0, treasury_debt_repaid: 0,
    treasury_debt_owed: 0, bankruptcy_count: 0, arrears_count: 0,
    forfeiture_amount: 0, forfeiture_count: 0, total_revenue: 1950,
    total_expenses: 675, net_treasury: 1275, trade_balance: 150,
    foreign_trade_volume: 610, effective_tax_rate: 75, exemption_share: 6.5, taxes_evaded: 60,
  },
  economy: {
    mammons_held: 3000, mammons_deposited: 600, mammons_withdrawn: 200,
    noble_income: 150, bathmatron_vault: 80, sold_to_stockpile: 120, taxes_evaded: 60,
    trade_exported_real: 400, trade_exported_bm: 60, trade_exported_total: 460,
    trade_imported: 150, merchant_levy_collected: 20, merchant_levy_taxed: 2,
    gnome_margin: 8, favor_from_sendoffs: 7, favor_from_navigator: 6,
    favor_from_goldface: 5, favor_from_silverface: 4, favor_penalties: 3,
    favor_high: 19, goldface: 31, silverface: 32, copperface: 33, purity: 34, peddler: 35,
  },
  ships: {
    total_hails: 9,
    realms: [
      { name: 'Zinthian Maritime League and the Eastern Harbor Principalities', hails: 5, avg_dock_min: 12.5, favor_earned: 8 },
      { name: 'Northern March of the Amber Crown', hails: 4, avg_dock_min: 0, favor_earned: 0 },
      { name: 'Abyssal Isles and the Distant Western Coast', hails: 0, avg_dock_min: null, favor_earned: 0 },
    ],
  },
  buckets: {
    real: [
      { name: 'Rare textiles and ceremonial clothing from the northern provinces', sold: 9, relieved: 3 },
      { name: 'Grain and other staples', sold: 0, relieved: 0 },
    ],
    black_market: [
      { name: 'Restricted antiquities and relics from the forgotten royal vaults', sold: 7 },
      { name: 'Unmarked cargo', sold: 0 },
    ],
  },
  contracts: {
    generated_total: 12, generated_pool: 6, generated_rumor: 4, generated_defense: 2,
    taken_total: 9, taken_pool: 5, taken_rumor: 3, taken_defense: 1,
    completed_total: 6, completed_pool: 3, completed_rumor: 2, completed_defense: 1,
    abandoned: 2, rerolled: 1, mammons_paid: 600, mammons_taxed: 50, mammons_forfeited: 20,
  },
  royal_favors: { pledge_generated: 20, pledge_consumed: 4, pledge_unused: 16,
    rumor_generated: 10, rumor_consumed: 6, rumor_unused: 4 },
});

type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'economic-chronicle', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    // Inferred reducer returns widen suspended:false to boolean.
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ static_data: chronicleData() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  backend.setGlobalStore(previousStore);
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <EconomicChronicleContent />;
};
const render = async () => { await act(async () => root.render(<Connected />)); };
const update = async (static_data: Partial<EconomicChronicleData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ static_data })));
};
const updateTreasury = (changes: Partial<TreasurySnapshot>) => update({
  treasury: { ...store.getState().backend.data.treasury, ...changes },
});
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const main = () => container.querySelector('main')!;
const rows = (table: HTMLTableElement) => Array.from(table.querySelectorAll('tbody tr')).map(
  (row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent),
);
const findRow = (label: string) => Array.from(main().querySelectorAll('tr')).find(
  (row) => row.querySelector('th')?.textContent === label,
);
const value = (label: string) => {
  const row = findRow(label);
  if (!row) throw new Error(`Missing row: ${label}`);
  return row.querySelector('td')?.textContent;
};

describe('Chronicle navigation', () => {
  test('five native tabs mount only the selected records and retain selection on snapshot refresh', async () => {
    await render();
    const tabs = ['Treasury', 'Economy', 'Ships', 'Navigator', 'Contracts'];
    expect(Array.from(container.querySelectorAll('nav[aria-label="Economic records"] button')).map((tab) => tab.textContent)).toEqual(tabs);
    for (const [index, tab] of tabs.entries()) {
      await click(button(tab));
      expect(button(tab).type).toBe('button');
      expect(button(tab).getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelectorAll('button[aria-pressed="true"]').length).toBe(1);
      expect(main().getAttribute('aria-label')).toBe(`${tab} records`);
      expect(main().querySelectorAll('h2').length).toBe(1);
      main().scrollTop = 75;
      await update({ treasury_balance: 2000 + index });
      expect(container.querySelector('header strong')?.textContent).toBe(`${2000 + index}m`);
      expect(button(tab).getAttribute('aria-pressed')).toBe('true');
      expect(main().scrollTop).toBe(75);
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('switching records resets the main scroll and refresh sends the existing action', async () => {
    await render();
    main().scrollTop = 400;
    await click(button('Ships'));
    expect(main().scrollTop).toBe(0);
    expect(main().tabIndex).toBe(0);
    expect(findRow('Starting Treasury')).toBeUndefined();
    await click(button('Refresh'));
    expect(sendMessage.mock.calls).toEqual([['act/refresh', {}]]);
    expect(button('Ships').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Ship and Navigator tables', () => {
  test('preserves server realm order, full names, and the distinction between zero and missing dock times', async () => {
    await render();
    await click(button('Ships'));
    const table = main().querySelector('table')!;
    expect(rows(table)).toEqual([
      ['Zinthian Maritime League and the Eastern Harbor Principalities', '5', '12.5', '8'],
      ['Northern March of the Amber Crown', '4', '0', '0'],
      ['Abyssal Isles and the Distant Western Coast', '0', '—', '0'],
    ]);
    expect(table.querySelectorAll('thead th[scope="col"]').length).toBe(4);
    expect(table.querySelectorAll('tbody th[scope="row"]').length).toBe(3);
    expect(main().textContent).toContain('9 hails recorded.');
  });

  test('keeps real and black market bucket names and server order with zero totals', async () => {
    await render();
    await click(button('Navigator'));
    const tables = main().querySelectorAll('table');
    expect(tables.length).toBe(2);
    expect(rows(tables[0])).toEqual([
      ['Rare textiles and ceremonial clothing from the northern provinces', '9', '3'],
      ['Grain and other staples', '0', '0'],
    ]);
    expect(rows(tables[1])).toEqual([
      ['Restricted antiquities and relics from the forgotten royal vaults', '7'], ['Unmarked cargo', '0'],
    ]);
    for (const table of tables) {
      expect(table.querySelectorAll('thead th:not([scope="col"])').length).toBe(0);
      expect(table.querySelectorAll('tbody th[scope="row"]').length).toBe(2);
    }
  });

  test('empty activity has explicit messages without phantom rows', async () => {
    await update({ ships: { total_hails: 0, realms: [] }, buckets: { real: [], black_market: [] } });
    await render();
    await click(button('Ships'));
    expect(main().textContent).toContain('No foreign ship activity recorded.');
    expect(main().querySelector('table')).toBeNull();
    await click(button('Navigator'));
    expect(main().textContent).toContain('No real-market activity recorded.');
    expect(main().textContent).toContain('No black-market activity recorded.');
    expect(main().querySelector('table')).toBeNull();
  });
});

describe('Treasury accounting', () => {
  test('keeps income and expense groups distinct and includes recovered spoils in the royal breakdown', async () => {
    await render();
    const columns = main().querySelectorAll('.EconomicChronicle__columns > div');
    expect(columns.length).toBe(2);
    expect(columns[0].querySelector('h3')?.textContent).toBe('Revenue');
    expect(columns[1].querySelector('h3')?.textContent).toBe('Expenses & Exemptions');
    expect(columns[0].contains(findRow('Total Revenue')!)).toBe(true);
    expect(columns[1].contains(findRow('Total Expenses')!)).toBe(true);
    expect(columns[0].textContent).toContain('Recovered Spoils 35');
    expect(columns[0].textContent).toContain('Other 5');
    expect(value('Royal Taxes Collected')).toBe('180');
    expect(value('Standing Order Revenue')).toBe('50');
    expect(value('Total Revenue')).toBe('1950');
    expect(value('Total Expenses')).toBe('675');
    expect(value('Forgone Revenue')).toBe('21');
    expect(columns[0].textContent).toContain('2 fulfilled • 1 expired • 1 petitioned (4p spent)');
    expect(findRow('Net Treasury Result')!.closest('.EconomicChronicle__insight')).not.toBeNull();
    for (const row of main().querySelectorAll('tr')) {
      expect(row.querySelector('th')?.getAttribute('scope')).toBe('row');
      expect(row.querySelectorAll('td').length).toBe(1);
    }
  });

  test.each([
    [1275, 150, '+1275', '+150'],
    [-25, -300, '-25', '-300'],
    [0, 0, '+0', '+0'],
  ] as const)('retains the signs of net %i and trade %i results', async (net, trade, netText, tradeText) => {
    await updateTreasury({ net_treasury: net, trade_balance: trade });
    await render();
    expect(value('Net Treasury Result')).toBe(netText);
    expect(value('Trade Balance')).toBe(tradeText);
    expect(value('Foreign Trade Volume')).toBe('610');
  });

  test('percentage zero is a real value while null reports unavailable, and refresh updates both', async () => {
    await updateTreasury({ effective_tax_rate: null, exemption_share: 0 });
    await render();
    expect(value('Effective Tax Rate')).toBe('n/a');
    expect(value('Forgone Share')).toBe('0%');
    await updateTreasury({ effective_tax_rate: 0, exemption_share: null });
    expect(value('Effective Tax Rate')).toBe('0%');
    expect(value('Forgone Share')).toBe('n/a');
    await updateTreasury({ effective_tax_rate: 75, exemption_share: 6.5 });
    expect(value('Effective Tax Rate')).toBe('75%');
    expect(value('Forgone Share')).toBe('6.5%');
  });

  test('optional debt and forfeiture rows appear on activity and disappear when cleared', async () => {
    await render();
    expect(findRow('Arrears')).toBeUndefined();
    expect(findRow('Receivership')).toBeUndefined();
    expect(findRow('Forfeitures')).toBeUndefined();
    expect(main().textContent).not.toContain('still owed');
    await updateTreasury({ arrears_count: 1, treasury_debt_owed: 75, banditry_owed: 12 });
    expect(value('Arrears')).toBe('1x arrears');
    expect(main().textContent).toContain('75 still owed');
    expect(main().textContent).toContain('12 still owed');
    await updateTreasury({ bankruptcy_count: 2, treasury_debt_repaid: 25,
      forfeiture_count: 1, forfeiture_amount: 80 });
    expect(findRow('Arrears')).toBeUndefined();
    expect(value('Receivership')).toBe('1x arrears, 2x bankruptcy');
    expect(main().textContent).toContain('25 repaid, 75 still owed');
    expect(value('Forfeitures')).toBe('80m');
    expect(main().textContent).toContain('from 1 departing Keep insider');
    expect(main().textContent).not.toContain('from 1 departing Keep insiders');
    await updateTreasury({ bankruptcy_count: 0, arrears_count: 0, treasury_debt_repaid: 0,
      treasury_debt_owed: 0, banditry_owed: 0, forfeiture_count: 0, forfeiture_amount: 0 });
    expect(findRow('Arrears')).toBeUndefined();
    expect(findRow('Receivership')).toBeUndefined();
    expect(findRow('Forfeitures')).toBeUndefined();
    expect(main().textContent).not.toContain('still owed');
  });

  test('debt amounts and forfeiture counts remain reportable without matching event counts or coin', async () => {
    await updateTreasury({ treasury_debt_repaid: 25, forfeiture_count: 2, forfeiture_amount: 0 });
    await render();
    expect(main().textContent).toContain('25 repaid');
    expect(value('Forfeitures')).toBe('0m');
    expect(main().textContent).toContain('from 2 departing Keep insiders');
    await updateTreasury({ treasury_debt_repaid: 0, treasury_debt_owed: 10,
      forfeiture_count: 0, forfeiture_amount: 60 });
    expect(main().textContent).toContain('10 still owed');
    expect(main().textContent).not.toContain('repaid');
    expect(value('Forfeitures')).toBe('60m');
    expect(main().textContent).not.toContain('departing Keep');
  });
});

test('Economy preserves monetary totals, vendor separation, and favor counts across data updates', async () => {
  await render();
  await click(button('Economy'));
  expect(value('Mammons Circulating')).toBe('3000');
  expect(value('Mammons Deposited')).toBe('600');
  expect(value('Mammons Withdrawn')).toBe('200');
  expect(value('Trade Value Exported')).toBe('460');
  expect(main().textContent).toContain('Real Market 400 • Black Market 60');
  expect(value('Trade Value Imported')).toBe('150');
  expect(value("Merchant's Levy Collected")).toBe('20');
  expect(value('Crown Duty on Levy')).toBe('2');
  expect(value('GOLDFACE Imports')).toBe('31');
  expect(value('SILVERFACE Imports')).toBe('32');
  expect(value('COPPERFACE Imports')).toBe('33');
  expect(value('PURITY Imports')).toBe('34');
  expect(value('Company Gnomes Margin')).toBe('8');
  expect(value('Favor - Penalties')).toBe('3');
  expect(value('Favor - Lifetime Peak')).toBe('19');
  await update({ economy: { ...chronicleData().economy, mammons_held: 0, trade_imported: 0 } });
  expect(value('Mammons Circulating')).toBe('0');
  expect(value('Trade Value Imported')).toBe('0');
  expect(button('Economy').getAttribute('aria-pressed')).toBe('true');
});

test('Contracts keeps lifecycle counts separate from payments and royal favor balances', async () => {
  await render();
  await click(button('Contracts'));
  const columns = main().querySelectorAll('.EconomicChronicle__columns > div');
  expect(columns.length).toBe(2);
  expect(columns[0].contains(findRow('Contracts Completed')!)).toBe(true);
  expect(columns[0].contains(findRow('Mammons Paid')!)).toBe(false);
  expect(columns[1].contains(findRow('Mammons Paid')!)).toBe(true);
  expect(columns[1].contains(findRow('Pledge Unused')!)).toBe(true);
  expect(value('Contracts Issued')).toBe('12');
  expect(value('Contracts Taken')).toBe('9');
  expect(value('Contracts Completed')).toBe('6');
  expect(Array.from(columns[0].querySelectorAll('p')).map((paragraph) => paragraph.textContent)).toEqual([
    'Guild 6 • Tavern 4 • Crown 2', 'Guild 5 • Tavern 3 • Crown 1', 'Guild 3 • Tavern 2 • Crown 1',
  ]);
  expect(value('Mammons Paid')).toBe('600');
  expect(value('Mammons Taxed')).toBe('50');
  expect(value('Mammons Forfeited')).toBe('20');
  expect(value('Pledge Generated')).toBe('20');
  expect(value('Pledge Consumed')).toBe('4');
  expect(value('Pledge Unused')).toBe('16');
  expect(value('Rumor Points Generated')).toBe('10');
  expect(value('Rumor Points Consumed')).toBe('6');
  expect(value('Rumor Points Unused')).toBe('4');
  await update({ contracts: { ...chronicleData().contracts, completed_total: 0,
    completed_pool: 0, completed_rumor: 0, completed_defense: 0, mammons_forfeited: 0 },
    royal_favors: { ...chronicleData().royal_favors,
      pledge_consumed: 20, pledge_unused: 0, rumor_consumed: 10, rumor_unused: 0 } });
  expect(value('Contracts Completed')).toBe('0');
  expect(value('Mammons Forfeited')).toBe('0');
  expect(value('Pledge Unused')).toBe('0');
  expect(value('Rumor Points Unused')).toBe('0');
  for (const header of main().querySelectorAll('th')) expect(header.getAttribute('scope')).toBe('row');
});
