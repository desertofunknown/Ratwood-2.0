<script lang="ts">
  import { tick, untrack } from 'svelte';

  import type { WorkbenchData } from '../model';
  import type { WorkbenchAction } from '../Workbench';
  import Workbench from './Workbench.svelte';

  let {
    initialData,
    onAction,
  }: { initialData: WorkbenchData; onAction: WorkbenchAction } = $props();
  // Snapshot only the outer envelope. Each delivery invalidates derivations even
  // if a transport mutated existing recipe/craftability records in place.
  let data = $state.raw<WorkbenchData>(untrack(() => ({ ...initialData })));

  export async function update(next: WorkbenchData) {
    data = { ...next };
    await tick();
  }
</script>

<Workbench {data} {onAction} />
