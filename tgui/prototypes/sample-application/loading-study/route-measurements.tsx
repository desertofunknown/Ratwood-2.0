import type { ScreenFactory, ScreenRenderer } from '../contracts';
import { startPage } from '../page';
import { type MeasurementMode, measureRoutes } from './route-measurement-core';

/** The same visible diagnostics and lifecycle observer wrap every study arm. */
export async function startMeasuredPage(
  Screen: ScreenRenderer,
  createSession: ScreenFactory,
  arm: 'react' | 'svelte',
  mode: MeasurementMode,
) {
  const measured = measureRoutes(Screen, createSession, arm, mode);
  const details = document.createElement('details');
  details.dataset.routeMeasurements = '';
  const summary = document.createElement('summary');
  summary.textContent = `${mode} / ${arm}: sample route-ready observations`;
  const explanation = document.createElement('p');
  explanation.textContent =
    'Request to original owner mounted, not asynchronous fixture-data readiness, paint, CPU, startup or native-client latency. First auxiliary visit is not a cold-cache claim. Retries include failed attempts and human waiting. Raw events below include failures and retirement; old events beyond the displayed capacity are counted as dropped. Reload resets observations, not necessarily browser caches.';
  const output = document.createElement('pre');
  output.tabIndex = 0;
  const report = () => {
    output.textContent = JSON.stringify(measured.read(), null, 2);
  };
  let unsubscribe = () => {};
  try {
    const fixture = await startPage(
      measured.Screen,
      measured.createSession,
      arm,
    );
    const originalDispose = fixture.dispose;
    fixture.dispose = async () => {
      try {
        await originalDispose();
      } finally {
        unsubscribe();
        measured.dispose();
        details.remove();
      }
    };
    try {
      details.append(summary, explanation, output);
      document.getElementById('fixture-controls')?.append(details);
      unsubscribe = measured.subscribe(report);
      report();
      return fixture;
    } catch (error) {
      try {
        await fixture.dispose();
      } catch {
        // Preserve the initialization error, not a secondary cleanup failure.
      }
      throw error;
    }
  } catch (error) {
    unsubscribe();
    measured.dispose();
    details.remove();
    throw error;
  }
}
