import {
  routeLabels,
  routes,
  type ScreenFactory,
  type ScreenRenderer,
} from './contracts';
import { createFixture, sampleConfig } from './runtime';

/** Explicit local controls live outside the one React root under evaluation. */
export async function startPage(
  Screen: ScreenRenderer,
  createSession: ScreenFactory,
  arm: 'react' | 'svelte',
) {
  const root = document.getElementById('fixture-root');
  const controls = document.getElementById('fixture-controls');
  if (!root || !controls)
    throw new Error('Sample application root and controls are required.');
  const fixture = createFixture(root, Screen, createSession);
  try {
    fixture.resume();
    let running = false;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${arm === 'react' ? 'React control' : 'React host + Svelte screens'}: disconnected QA controls`;
    const explanation = document.createElement('p');
    explanation.textContent =
      'One production React Window and store. Four local sample screens. Calls stay in memory. No native subscription, live trade, saved preferences or production routing. Status dimming is visual only.';
    const buttons = document.createElement('div');
    buttons.className = 'fixture-buttons';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const output = document.createElement('pre');
    output.tabIndex = 0;
    const report = () => {
      output.textContent = JSON.stringify(
        { arm, state: fixture.read() },
        null,
        2,
      );
    };
    const add = (
      label: string,
      operation: () => unknown | Promise<unknown>,
    ) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = async () => {
        if (running) return;
        running = true;
        for (const control of buttons.querySelectorAll('button'))
          control.disabled = true;
        status.textContent = `${label}…`;
        try {
          await operation();
          await fixture.settle();
          status.textContent = `${label}: complete`;
        } catch (error) {
          status.textContent = `${label}: FAILED ${String(error)}`;
        } finally {
          running = false;
          for (const control of buttons.querySelectorAll('button'))
            control.disabled = false;
          report();
        }
      };
      buttons.append(button);
    };
    for (const route of routes)
      add(`Open ${routeLabels[route]}`, () => fixture.navigate(route));
    add('Suspend start', () => fixture.dispatch('backend/suspendStart'));
    add('Acknowledge suspend', () => fixture.dispatch('suspend'));
    add('Resume sample', fixture.resume);
    add('Toggle refreshing', () =>
      fixture.update({ config: { refreshing: !fixture.read().refreshing } }),
    );
    add('Toggle interface identity', () =>
      fixture.update({
        config: {
          interface:
            fixture.store.getState().backend.config.interface?.name ===
            'SampleApplication'
              ? { name: 'FixtureInactive', layout: 'Window' }
              : sampleConfig().interface,
        },
      }),
    );
    add('Swap pooled key', () =>
      fixture.update({
        config: {
          window: sampleConfig(
            fixture.read().key === 'sample-application-a'
              ? 'sample-application-b'
              : 'sample-application-a',
          ).window,
        },
      }),
    );
    add('Toggle status dimmer', () =>
      fixture.update({
        config: { status: fixture.read().status === 2 ? 1 : 2 },
      }),
    );
    add('Acknowledge workbench filter', () => {
      const call = [...fixture.endpoint.calls]
        .reverse()
        .find(
          (entry) =>
            entry.method === 'sendMessage' &&
            entry.arguments[0] === 'act/checkboxonlycraftable',
        );
      if (!call) throw new Error('Use the workbench material filter first.');
      fixture.update({
        data: {
          showonlycraftable: (call.arguments[1] as { state: boolean }).state,
        },
      });
    });
    add('Unmount root', fixture.unmountRoot);
    add('Remount root', fixture.mountRoot);
    add('Refresh recorded calls', report);
    add('Hide QA controls until reload', () => {
      controls.remove();
      root
        .querySelector<HTMLElement>('.SampleApplication__heading')
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
    const previousInspection = Object.getOwnPropertyDescriptor(
      window,
      'sampleApplication',
    );
    const inspection = Object.freeze({
      arm,
      read: () => ({ arm, state: fixture.read() }),
    });
    Object.defineProperty(window, 'sampleApplication', {
      configurable: true,
      value: inspection,
    });
    const originalDispose = fixture.dispose;
    fixture.dispose = async () => {
      try {
        await originalDispose();
      } finally {
        if (Reflect.get(window, 'sampleApplication') === inspection) {
          if (previousInspection)
            Object.defineProperty(
              window,
              'sampleApplication',
              previousInspection,
            );
          else Reflect.deleteProperty(window, 'sampleApplication');
        }
        details.remove();
      }
    };
    status.textContent = 'Ready. Controls run only when requested.';
    return fixture;
  } catch (error) {
    try {
      await fixture.dispose();
    } catch {
      /* Preserve the initialization error. */
    }
    throw error;
  }
}
