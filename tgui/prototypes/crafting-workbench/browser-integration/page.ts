import type { Arm } from './contracts';
import { createFixture, sampleConfig } from './runtime';
import { runChecks } from './scenarios';

/** The controls intentionally live outside the React root under test. */
export async function startPage(Arm: Arm, arm: 'react' | 'svelte') {
  const root = document.getElementById('fixture-root')!;
  const controls = document.getElementById('fixture-controls')!;
  const fixture = createFixture(root, Arm);
  fixture.resume();
  let running = false;
  let result: object | undefined;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `Disconnected ${arm === 'react' ? 'React control' : 'React-owned Svelte'} fixture controls`;
  const explanation = document.createElement('p');
  explanation.textContent =
    'Sample data only. Calls below stay in memory. No game connection. The status dimmer is visual only. Scripted checks do not establish keyboard, pixels, native acceptance or performance.';
  const buttons = document.createElement('div');
  buttons.className = 'fixture-buttons';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const output = document.createElement('pre');
  output.tabIndex = 0;
  const report = () => {
    output.textContent = JSON.stringify(
      { arm, result, state: fixture.read() },
      null,
      2,
    );
  };
  const addButton = (label: string, operation: () => void | Promise<void>) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = async () => {
      if (running) return;
      running = true;
      for (const control of buttons.querySelectorAll('button')) {
        control.disabled = true;
      }
      status.textContent = `${label}…`;
      try {
        await operation();
        await fixture.settle();
        status.textContent = `${label}: complete`;
      } catch (error) {
        result = { failed: String(error) };
        status.textContent = `${label}: FAILED ${String(error)}`;
      } finally {
        running = false;
        for (const control of buttons.querySelectorAll('button')) {
          control.disabled = false;
        }
        report();
      }
    };
    buttons.append(button);
  };
  addButton('Run lifecycle and action checks', async () => {
    result = { checks: await runChecks(fixture) };
  });
  addButton('Suspend start', () => fixture.dispatch('backend/suspendStart'));
  addButton('Acknowledge suspend', () => fixture.dispatch('suspend'));
  addButton('Resume sample', () => {
    fixture.dispatch('suspend');
    fixture.resume();
  });
  addButton('Toggle refreshing', () =>
    fixture.update({ config: { refreshing: !fixture.read().refreshing } }),
  );
  addButton('Toggle route', () =>
    fixture.update({
      config: {
        interface:
          fixture.store.getState().backend.config.interface?.name === 'MiaCraft'
            ? { name: 'FixtureInactive', layout: 'Window' }
            : sampleConfig().interface,
      },
    }),
  );
  addButton('Swap pooled key', () =>
    fixture.update({
      config: {
        window: sampleConfig(
          fixture.read().key === 'sample-window-a'
            ? 'sample-window-b'
            : 'sample-window-a',
        ).window,
      },
    }),
  );
  addButton('Toggle status dimmer', () =>
    fixture.update({ config: { status: fixture.read().status === 2 ? 1 : 2 } }),
  );
  addButton('Acknowledge filter', () => {
    const last = [...fixture.endpoint.calls]
      .reverse()
      .find(
        (call) =>
          call.method === 'sendMessage' &&
          call.arguments[0] === 'act/checkboxonlycraftable',
      );
    if (!last) throw new Error('Click Material matches only first.');
    fixture.update({
      data: {
        showonlycraftable: (last.arguments[1] as { state: boolean }).state,
      },
    });
  });
  addButton('Unmount root', () => fixture.unmountRoot());
  addButton('Remount root', () => fixture.mountRoot());
  addButton('Refresh recorded calls', () => report());
  addButton('Hide QA controls until reload', () => {
    controls.remove();
    root
      .querySelector<HTMLElement>('.Layout__content')
      ?.focus({ preventScroll: true });
  });
  const notices = document.createElement('p');
  const link = document.createElement('a');
  link.href = '../NOTICE.txt';
  link.textContent = 'Source and license inventory';
  notices.append(link);
  details.append(summary, explanation, buttons, status, output, notices);
  controls.append(details);
  await fixture.settle();
  report();
  // Inspection only. Scripted actions use the visible, explicit controls above.
  Reflect.set(window, 'workbenchIntegration', {
    arm,
    read: () => ({ arm, result, state: fixture.read() }),
  });
  status.textContent = 'Ready. Checks run only when requested.';
  // Internal page-test cleanup handle; the window inspection API stays read-only.
  return fixture;
}
