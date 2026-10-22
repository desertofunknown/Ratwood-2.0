<script lang="ts">
	import type { SettingsViewProps } from './model';
	let { data, onToggle, onSelect }: SettingsViewProps = $props();
	const prefix = $props.id();
</script>

<section class="TithewoodSurface DisplayReadability">
	<h2 class="DisplayReadability__title">Display &amp; Readability</h2>
	<p class="DisplayReadability__scope">
		In game, these controls save account preferences except TGUI Multiline,
		which affects only the current mob. This sample cannot verify saving or
		native effects.
	</p>
	{#each data.categories as category, categoryIndex (category.name)}
		<section
			class="DisplayReadability__category"
			data-category-name={category.name}
			aria-labelledby={`${prefix}-category-${categoryIndex}`}
		>
			<h3 id={`${prefix}-category-${categoryIndex}`}>{category.name}</h3>
			{#each category.entries as entry (entry.id)}
				<div class="DisplayReadability__row" data-setting-id={entry.id}>
					<button
						type="button"
						class="TithewoodControl DisplayReadability__toggle"
						data-toggle-id={entry.id}
						aria-pressed={Boolean(entry.enabled)}
						aria-describedby={`${prefix}-description-${entry.id}`}
						onclick={() => onToggle(entry.id)}
					>
						<span>{entry.label}</span><span
							class="DisplayReadability__state"
							aria-hidden="true"
							>{entry.enabled ? 'On' : 'Off'}</span
						>
					</button>
					<p
						id={`${prefix}-description-${entry.id}`}
						class="DisplayReadability__description"
					>
						{entry.desc}
					</p>
					{#if entry.id === 'tgui_multiline'}<p
							class="DisplayReadability__transient"
						>
							Current mob only in game
						</p>{/if}
				</div>
			{/each}
			{#each category.selects || [] as entry (entry.id)}
				<fieldset
					class="DisplayReadability__palette"
					data-setting-id={entry.id}
					data-select-id={entry.id}
					aria-describedby={`${prefix}-description-${entry.id}`}
				>
					<legend>{entry.label}</legend>
					<p
						id={`${prefix}-description-${entry.id}`}
						class="DisplayReadability__description"
					>
						{entry.desc}
					</p>
					<div class="DisplayReadability__options">
						{#each Array.isArray(entry.options) ? entry.options : [] as option (option.value)}
							<button
								type="button"
								class="TithewoodControl"
								aria-pressed={entry.value === option.value}
								aria-describedby={`${prefix}-description-${entry.id}`}
								data-option-value={option.value}
								onclick={() => onSelect(entry.id, option.value)}
								>{option.label}</button
							>
						{/each}
					</div>
				</fieldset>
			{/each}
		</section>
	{/each}
</section>
