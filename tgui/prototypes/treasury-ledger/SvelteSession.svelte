<script lang="ts">
	import { onMount } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';

	import type { Controller } from './model';
	import SvelteView from './SvelteView.svelte';

	let { controller }: { controller: Controller } = $props();
	let snapshot: ReturnType<Controller['snapshot']> = $state.raw({
		open: false,
		draft: '',
	});
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

<SvelteView
	page={snapshot.page}
	draft={snapshot.draft}
	onDraft={controller.draft}
	onClear={controller.clear}
	onPage={controller.page}
	onRefresh={controller.refresh}
/>
