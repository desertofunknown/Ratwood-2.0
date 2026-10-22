<script lang="ts">
  import { tick } from 'svelte';

  import { createDemoData } from '../fixtures';
  import type { WorkbenchData } from '../model';
  import type { WorkbenchAction } from '../Workbench';
  import Workbench from './Workbench.svelte';

  let { actions }: { actions: unknown[] } = $props();
  let data = $state.raw<WorkbenchData>(createDemoData());
  let lastAction = $state('No requests recorded.');
  const onAction: WorkbenchAction = (action, payload) => {
    actions.push({ action, payload });
    lastAction = `${action}: ${JSON.stringify(payload)}`;
    if (action === 'checkboxonlycraftable') {
      // Simulated acknowledgement only; no game transport is loaded.
      data = { ...data, showonlycraftable: Boolean(payload.state) };
    }
  };
  export async function update(next: WorkbenchData) {
    data = { ...next };
    await tick();
  }
</script>

<div class="demo-shell">
  <div class="demo-notice">
    Design prototype · Sample data · No game connection
  </div>
  <Workbench {data} {onAction} />
  <div class="demo-event" role="status" aria-live="polite">{lastAction}</div>
</div>
