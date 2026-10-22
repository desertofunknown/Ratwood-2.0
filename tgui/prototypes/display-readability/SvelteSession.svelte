<script lang="ts">
	import { onMount } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
	import type { Controller, State } from './model';
	import SvelteView from './SvelteView.svelte';
	let { controller }: { controller: Controller } = $props();
	let snapshot: State = $state.raw({ open: false });
	onMount(() => {
		const unsubscribe = controller.subscribe(() => {
			snapshot = controller.snapshot();
		});
		controller.open();
		return () => {
			unsubscribe();
			controller.close();
		};
	});
</script>

{#if snapshot.data}
	<SvelteView
		data={snapshot.data}
		onToggle={controller.toggle}
		onSelect={controller.select}
	/>
{:else}
	<p class="TithewoodSurface DisplayReadability">Waiting for sample state.</p>
{/if}
