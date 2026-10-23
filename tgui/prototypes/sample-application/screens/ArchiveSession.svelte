<script lang="ts">
  import { onMount, untrack } from '../../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
  import ArchiveView from '../../changes-archive/SvelteView.svelte';
  import type { ArchiveSession } from './session';

  let { session }: { session: ArchiveSession } = $props();
  let snapshot = $state.raw(untrack(() => session.snapshot()));

  onMount(() => {
    const unsubscribe = session.subscribe(() => {
      snapshot = session.snapshot();
    });
    snapshot = session.snapshot();
    return unsubscribe;
  });
</script>

{#key snapshot.controller}
  <ArchiveView controller={snapshot.controller} />
{/key}
