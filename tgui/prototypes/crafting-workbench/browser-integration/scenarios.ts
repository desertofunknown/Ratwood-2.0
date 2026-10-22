import { createDemoData } from '../fixtures';
import { type Fixture, sampleConfig } from './runtime';

export type CheckResult = { name: string; passed: true };
export async function runChecks(fixture: Fixture) {
  const results: CheckResult[] = [];
  const assert = (condition: unknown, name: string) => {
    if (!condition) throw new Error(name);
    results.push({ name, passed: true });
  };
  const click = async (element: HTMLElement | null | undefined) => {
    if (!element) {
      throw new Error('Expected visible fixture control was absent.');
    }
    element.click();
    await fixture.settle();
  };
  const button = (text: string) =>
    [...fixture.target.querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === text,
    );
  const rows = () => [
    ...fixture.target.querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
  ];
  const acts = () =>
    fixture.endpoint.calls.filter(
      (call) =>
        call.method === 'sendMessage' &&
        String(call.arguments[0]).startsWith('act/'),
    );
  const open = async (name: string, variant = 0) =>
    click(
      rows().filter(
        (row) =>
          row.querySelector('.Workbench__recipe-name')?.textContent === name,
      )[variant],
    );
  const staleCheck = (action: NonNullable<Fixture['action']>, name: string) => {
    // Retained act count can stay unchanged when a new call evicts an old one.
    const count = fixture.endpoint.totalRecordedCalls;
    action('craft', { item: '/sample/plough' });
    assert(fixture.endpoint.totalRecordedCalls === count, name);
  };

  fixture.unmountRoot();
  fixture.dispatch('suspend');
  fixture.resume();
  fixture.mountRoot();
  await fixture.settle();
  assert(
    rows().length === 9,
    'Complete sample data renders through real store and Window',
  );
  assert(
    fixture.target.querySelector('.TitleBar__title')?.textContent ===
      sampleConfig().title,
    'Real TitleBar renders sample title',
  );
  await open('Wooden bucket', 1);
  for (const label of ['Craft 1', 'Craft 2', 'Craft 3', 'Craft 5', 'Repeat']) {
    await click(button(label));
  }
  const expected = [
    { item: '/sample/bucket/planks' },
    { item: '/sample/bucket/planks', amount: 2 },
    { item: '/sample/bucket/planks', amount: 3 },
    { item: '/sample/bucket/planks', amount: 5 },
    { item: '/sample/bucket/planks', auto: true },
  ];
  assert(
    JSON.stringify(
      acts()
        .slice(-5)
        .map((call) => call.arguments),
    ) === JSON.stringify(expected.map((payload) => ['act/craft', payload])),
    'Exact 1/2/3/5/repeat payloads preserve duplicate-name recipe identity',
  );
  const data = fixture.store.getState().backend.data;
  const bucket = Object.values(data.crafting_recipes.Woodworking).find(
    (recipe: any) => recipe.path === '/sample/bucket/planks',
  ) as { req_text: string };
  bucket.req_text = 'SAMPLE UPDATE: 7 wooden planks';
  fixture.update({ data });
  await fixture.settle();
  assert(
    fixture.target
      .querySelector('.Workbench__requirements')
      ?.textContent?.includes('SAMPLE UPDATE: 7 wooden planks'),
    'Nested in-place mutation reaches selected recipe',
  );
  const withoutBucket = createDemoData();
  withoutBucket.crafting_recipes.Woodworking = Object.values(
    withoutBucket.crafting_recipes.Woodworking,
  ).filter((recipe) => recipe.path !== '/sample/bucket/planks');
  fixture.update({ data: withoutBucket });
  await fixture.settle();
  assert(
    !button('Craft 1'),
    'Removing selected recipe clears stale craft controls',
  );

  fixture.resume();
  await fixture.settle();
  const checkbox = fixture.target.querySelector<HTMLInputElement>(
    'input[type=checkbox]',
  )!;
  await click(checkbox);
  assert(
    JSON.stringify(acts().at(-1)?.arguments) ===
      JSON.stringify(['act/checkboxonlycraftable', { state: true }]),
    'Filter sends exact sample action through sendAct',
  );
  assert(
    !checkbox.checked,
    'Filter waits for explicit fake backend acknowledgement',
  );
  fixture.update({ data: { showonlycraftable: true } });
  await fixture.settle();
  assert(
    checkbox.checked && rows().length === 6,
    'Merged backend filter acknowledgement controls displayed recipes',
  );

  const oldAction = fixture.action!;
  await click(
    fixture.target.querySelector<HTMLElement>('[aria-label="Close window"]'),
  );
  assert(
    fixture.read().suspending &&
      fixture.endpoint.calls.some(
        (call) =>
          call.method === 'sendMessage' && call.arguments[0] === 'suspend',
      ),
    'Real close control starts middleware suspend request',
  );
  staleCheck(oldAction, 'Suspending fences old action');
  fixture.dispatch('suspend');
  await fixture.settle();
  assert(
    !fixture.target.querySelector('.Window'),
    'Real suspend acknowledgement removes Window',
  );
  fixture.resume();
  await fixture.settle();
  staleCheck(oldAction, 'Old action stays fenced after resume');

  const beforeCoalesced = fixture.action!;
  // Deliberately coalesce React work; the synchronous lifetime observer must
  // still see the real store's intermediate suspension notification.
  fixture.store.dispatch({ type: 'suspend' });
  fixture.store.dispatch({
    type: 'update',
    payload: { config: sampleConfig(), data: createDemoData() },
  });
  staleCheck(
    beforeCoalesced,
    'Coalesced suspend/resume fences old callback before commit',
  );
  await fixture.settle();
  staleCheck(
    beforeCoalesced,
    'Coalesced suspend/resume stays fenced after commit',
  );

  const beforeRefresh = fixture.action!;
  fixture.update({ config: { refreshing: true } });
  await fixture.settle();
  staleCheck(beforeRefresh, 'Refreshing fences old callback');
  assert(
    !fixture.target.querySelector('.Workbench'),
    'Refresh retires workbench subtree',
  );
  fixture.update({ config: { refreshing: false } });
  await fixture.settle();
  const beforeRoute = fixture.action!;
  fixture.update({
    config: { interface: { name: 'FixtureInactive', layout: 'Window' } },
  });
  await fixture.settle();
  staleCheck(beforeRoute, 'Route replacement fences retired action');
  assert(
    !fixture.target.querySelector('.Workbench'),
    'Non-workbench route retires subtree',
  );
  fixture.update({ config: { interface: sampleConfig().interface } });
  await fixture.settle();
  const beforePool = fixture.action!;
  const beforePoolNode = fixture.target.querySelector('.Workbench');
  fixture.update({
    config: { window: sampleConfig('sample-window-b').window },
  });
  await fixture.settle();
  staleCheck(beforePool, 'Pooled key replacement fences retired action');
  assert(
    fixture.target.querySelector('.Workbench') !== beforePoolNode,
    'Pooled key gets a new owned subtree',
  );
  fixture.update({ config: { status: 1 } });
  await fixture.settle();
  assert(
    !!fixture.target.querySelector('.Window__dimmer'),
    'Real status dimmer is present (visual, not authorization)',
  );
  fixture.update({ config: { status: 2 } });
  await fixture.settle();

  const beforeUnmount = fixture.action!;
  fixture.unmountRoot();
  await fixture.settle();
  staleCheck(beforeUnmount, 'Unmounted root action is fenced');
  assert(
    fixture.read().subscriptions === 1 && fixture.read().pendingDisposals === 0,
    'Unmount removes React subscription and settles owned disposal',
  );
  fixture.mountRoot();
  await fixture.settle();
  assert(
    fixture.target.querySelectorAll('.Workbench').length === 1,
    'Remount owns exactly one workbench',
  );
  assert(
    fixture.read().errors.length === 0 &&
      fixture.read().nativeSubscriptionAttempts === 0,
    'No lifecycle error or native subscription attempt',
  );
  return results;
}
