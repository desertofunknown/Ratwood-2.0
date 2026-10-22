<script lang="ts">
	import {
		onMount,
		tick,
		untrack,
	} from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
	import { createMarketController } from './model';
	import type { TradeModalRequest } from '../../packages/tgui/interfaces/StewardTrade/tradeQuote';
	import type { MarketRegionOption } from '../../packages/tgui/interfaces/StewardTrade/types';

	let {
		controller,
	}: { controller: ReturnType<typeof createMarketController> } = $props();
	let s = $state(untrack(() => controller.snapshot()));
	let data = $derived(s.data);
	let q = $derived(s.quoteState);
	let request = $derived(s.request);
	let quantityInput = $state<HTMLInputElement>();
	let backButton = $state<HTMLButtonElement>();
	let initiatingButton: HTMLButtonElement | undefined;
	onMount(() =>
		controller.subscribe(() => {
			s = controller.snapshot();
		}),
	);

	async function openQuote(
		request: TradeModalRequest,
		button: HTMLButtonElement,
	) {
		initiatingButton = button;
		controller.openQuote(request);
		await tick();
		(quantityInput?.disabled ? backButton : quantityInput)?.focus();
	}
	async function closeQuote() {
		controller.closeQuote();
		await tick();
		if (initiatingButton?.isConnected) initiatingButton.focus();
	}
</script>

{#snippet region(
	option: MarketRegionOption,
	side: 'import' | 'export',
	goodId: string,
)}
	{@const regionName =
		data.region_catalog[option.region_id]?.name ?? option.region_id}
	{@const goodName = data.good_catalog[goodId]?.name ?? goodId}
	<div class="MarketQuote__region">
		<span>{regionName}</span>
		<strong>{option.unit_price}m / unit</strong>
		<span
			>{option.capacity_today} / {option.capacity_total} today · {option.batch_capacity}
			per shipment</span
		>
		{#if option.is_blockaded}<strong class="MarketQuote__issue"
				>Blockaded</strong
			>{/if}
		{#if option.capacity_today <= 0}<span class="MarketQuote__notice"
				>Saturated</span
			>{/if}
		<button
			class="TithewoodControl"
			type="button"
			data-market-region={option.region_id}
			data-market-side={side}
			data-market-route-good={goodId}
			aria-label={`Inspect ${side} ${goodName} ${side === 'import' ? 'from' : 'to'} ${regionName}`}
			onclick={(event) =>
				openQuote(
					{ side, regionId: option.region_id, goodId },
					event.currentTarget,
				)}>Inspect {side === 'import' ? 'import' : 'export'}</button
		>
	</div>
{/snippet}
<section class="MarketQuote TithewoodSurface" aria-label="Market quote preview">
	<header class="MarketQuote__header">
		<div>
			<h2>Market</h2>
			<p>Read-only shipment quote inspector</p>
		</div>
		<p>Day {data.day} · Crown's Purse <strong>{data.treasury}m</strong></p>
	</header>
	<div class="MarketQuote__body">
		<p class="MarketQuote__notice">
			Disconnected sample. No shipment can be placed. Stockpile management
			and commissions are outside this preview.
		</p>
		{#if data.sequestration.active}<p
				class="MarketQuote__issue"
				role="status"
			>
				Commerce is in sequestration. This trade cannot be placed.
			</p>{/if}
		{#if data.market_rows.length === 0}<p class="MarketQuote__notice">
				No goods accepted at present.
			</p>
		{:else}
			<nav class="MarketQuote__tabs" aria-label="Goods categories">
				{#each s.groups as group (group.category)}
					<button
						class="TithewoodControl"
						type="button"
						data-market-category={group.category}
						aria-pressed={group.category ===
							s.activeGroup?.category}
						onclick={() =>
							controller.selectCategory(group.category)}
						>{group.label} ({group.rows.length})</button
					>
				{/each}
			</nav>
			<div
				class="MarketQuote__catalog"
				aria-label={s.activeGroup?.label ?? 'Goods'}
			>
				{#each s.activeGroup?.rows ?? [] as row (row.good_id)}
					{@const good = data.good_catalog[row.good_id]}
					{@const expanded = s.expanded.includes(row.good_id)}
					{@const hasAlternatives =
						row.import_regions.length > 1 ||
						row.export_regions.length > 1}
					<article
						class="MarketQuote__row"
						data-market-good={row.good_id}
					>
						<header>
							<h3>{good?.name ?? row.good_id}</h3>
							<span>Stock {row.stock} / {row.stock_limit}</span
							>{#if row.event_tag}<strong>{row.event_tag}</strong
								>{/if}
						</header>
						<div class="MarketQuote__regions">
							<div>
								<h4>Best buy</h4>
								{#if row.import_regions[0]}{@render region(
										row.import_regions[0],
										'import',
										row.good_id,
									)}{:else}<p>
										{good?.importable
											? 'No producing region'
											: 'Not importable'}
									</p>{/if}
							</div>
							<div>
								<h4>Best sell</h4>
								{#if row.export_regions[0]}{@render region(
										row.export_regions[0],
										'export',
										row.good_id,
									)}{:else}<p>No demanding region</p>{/if}
							</div>
						</div>
						{#if hasAlternatives}
							<button
								class="TithewoodControl"
								type="button"
								data-market-expand={row.good_id}
								aria-expanded={expanded}
								aria-controls={`market-alternatives-${row.good_id}`}
								onclick={() =>
									controller.toggleExpanded(row.good_id)}
								>{expanded ? 'Hide' : 'Compare'} other regions</button
							>
							<div
								class="MarketQuote__regions"
								id={`market-alternatives-${row.good_id}`}
								hidden={!expanded}
							>
								{#if expanded}
									<div>
										<h4>Other buy regions</h4>
										{#each row.import_regions.slice(1) as option (option.region_id)}{@render region(
												option,
												'import',
												row.good_id,
											)}{:else}<p>
												No other producing region
											</p>{/each}
									</div>
									<div>
										<h4>Other sell regions</h4>
										{#each row.export_regions.slice(1) as option (option.region_id)}{@render region(
												option,
												'export',
												row.good_id,
											)}{:else}<p>
												No other demanding region
											</p>{/each}
									</div>
								{/if}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
		{#if request && q}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Handles Escape bubbled from native quote controls without trapping focus.) -->
			<section
				class="MarketQuote__quote"
				aria-labelledby="market-quote-title"
				onkeydown={(event) => {
					if (event.key === 'Escape') {
						event.preventDefault();
						void closeQuote();
					}
				}}
			>
				<header>
					<div>
						<h2 id="market-quote-title">
							{q.sideLabel}
							{data.good_catalog[request.goodId]?.name ??
								request.goodId}
						</h2>
						<p>
							{q.isImport ? 'from' : 'to'}
							{data.region_catalog[request.regionId]?.name ??
								request.regionId}
						</p>
					</div>
					<button
						class="TithewoodControl"
						type="button"
						data-quote-back
                        bind:this={backButton}
						onclick={closeQuote}>Back to regions</button
					>
				</header>
				<div class="MarketQuote__quantity">
					<label for="market-quote-quantity">Quantity</label>
					<div>
						{#each [-10, -1] as delta}<button
								class="TithewoodControl"
								type="button"
								aria-label={`Decrease quantity by ${Math.abs(delta)}`}
								disabled={!!data.sequestration.active ||
									q.maxUnits < 1 ||
									q.quantity <= 1}
								onclick={() => controller.changeQuantity(delta)}
								>{delta === -1 ? '−' : '−10'}</button
							>{/each}
						<input
							class="TithewoodControl"
							bind:this={quantityInput}
							id="market-quote-quantity"
							data-quote-quantity
							type="number"
							min={1}
							max={q.maxUnits}
							step={1}
							value={s.draft.text}
							disabled={!!data.sequestration.active}
							aria-invalid={!q.validQuantity}
							aria-describedby="market-quote-limits market-quote-status"
							oninput={(event) =>
								controller.setQuantity(
									event.currentTarget.value,
								)}
						/>
						{#each [1, 10] as delta}<button
								class="TithewoodControl"
								type="button"
								aria-label={`Increase quantity by ${delta}`}
								disabled={!!data.sequestration.active ||
									q.maxUnits < 1 ||
									q.quantity >= q.maxUnits}
								onclick={() => controller.changeQuantity(delta)}
								>+{delta === 1 ? '' : delta}</button
							>{/each}
						<button
							class="TithewoodControl"
							type="button"
							data-quote-fill
							disabled={!q.canFill || q.atFill}
							title={q.fillTooltip}
							onclick={() => controller.fillQuantity()}
							>Fill {q.canFill ? q.fillTarget : '—'}</button
						>
					</div>
				</div>
				<p id="market-quote-limits">
					Stockpile: {q.details ? `${q.stockpile} units` : '…'} · Max {q.maxUnits}
					per trade{!q.isImport &&
					q.details &&
					q.stockpile < q.bulkMax
						? ' (limited by stockpile)'
						: ''}
				</p>
				<p>
					{q.details
						? q.isImport
							? `${q.batchCapacity} units at base price in one shipment. Buying past that drives the price up the more you take.`
							: `${q.batchCapacity} units of demand left in one shipment. Selling past that floods the market and the price drops.`
						: 'Waiting for regional prices and shipment capacity.'}
				</p>
				{#if !q.quote && q.details}<p class="MarketQuote__notice">
						Capacity and stock above are from the last accepted
						response. Prices and totals stay hidden until a quote
						matches this draft.
					</p>{/if}
				<dl
					class="MarketQuote__facts"
					aria-label="Shipment quote account"
				>
					<div>
						<dt>
							{q.isImport
								? 'Region output today'
								: 'Region appetite today'}
						</dt>
						<dd>
							{q.details
								? `${q.details.capacity_today} / ${q.details.capacity_total} units`
								: '…'}
						</dd>
					</div>
					<div>
						<dt>Units at base price</dt>
						<dd>
							{q.quote
								? `${Math.min(q.quantity, q.batchCapacity)} / ${q.quantity}`
								: '…'}
						</dd>
					</div>
					<div>
						<dt>Units past saturation</dt>
						<dd>
							{q.quote
								? Math.max(0, q.quantity - q.batchCapacity)
								: '…'}
						</dd>
					</div>
					<div>
						<dt>Base unit price</dt>
						<dd>
							{q.quote
								? `${q.quote.base_unit_price}m / unit`
								: '…'}
						</dd>
					</div>
					<div>
						<dt>Base subtotal</dt>
						<dd>{q.quote ? `${q.quote.base_subtotal}m` : '…'}</dd>
					</div>
					<div>
						<dt>
							{q.isImport
								? 'Escalation surcharge'
								: 'Revenue lost to oversupply'}
						</dt>
						<dd>
							{q.quote
								? `${q.isImport ? '+' : '−'}${q.escalation}m`
								: '…'}
						</dd>
					</div>
					<div class="MarketQuote__total">
						<dt>{q.isImport ? 'Total cost' : 'Total revenue'}</dt>
						<dd>{q.quote ? `${q.quote.total}m` : '…'}</dd>
					</div>
					<div>
						<dt>Crown's Purse after</dt>
						<dd>{q.quote ? `${q.quote.balance_after}m` : '…'}</dd>
					</div>
					<div>
						<dt>Stockpile after</dt>
						<dd>
							{q.quote ? `${q.quote.stockpile_after} units` : '…'}
						</dd>
					</div>
					{#if q.details?.is_alderman_acting && q.details.warrant_remaining >= 0}<div
						>
							<dt>Warrant remaining</dt>
							<dd>
								{q.quote
									? `${q.quote.warrant_remaining}m`
									: '…'}
							</dd>
						</div>{/if}
				</dl>
				{#if q.blockaded}<p class="MarketQuote__issue">
						This route is blockaded. {q.isImport
							? 'Cost is doubled.'
							: 'Revenue is halved.'}
					</p>{/if}
				<footer class="MarketQuote__footer">
					<p
						id="market-quote-status"
						class={q.issue
							? 'MarketQuote__issue'
							: 'MarketQuote__notice'}
						role="status"
					>
						{q.issue || 'Current recorded quote ready.'}
					</p>
					{#if s.deliveryNote}<p class="MarketQuote__notice">
							{s.deliveryNote}
						</p>{/if}
					<p class="MarketQuote__notice">
						The live server reprices at confirmation. This recorded
						sample is not a guaranteed price and cannot execute a
						trade.
					</p>
					<button class="TithewoodControl" type="button" disabled
						>Preview only · no trade</button
					>
				</footer>
			</section>
		{/if}
	</div>
</section>
