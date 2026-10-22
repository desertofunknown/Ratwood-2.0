<script lang="ts">
	import { type LedgerViewProps, projectEntry } from './model';

	let { page, draft, onDraft, onClear, onPage, onRefresh }: LedgerViewProps =
		$props();
	let searchInput = $state<HTMLInputElement>();
</script>

{#if !page}
	<p class="TithewoodSurface TreasuryLedger TreasuryLedger__loading">
		Opening the ledger...
	</p>
{:else}
	<section class="TithewoodSurface TreasuryLedger">
		<h2 class="TreasuryLedger__title">
			Treasury Ledger <small>newest first</small>
		</h2>
		<div class="TreasuryLedger__toolbar">
			<label class="TreasuryLedger__search">
				Search{' '}
				<input
					bind:this={searchInput}
					class="TithewoodControl"
					type="search"
					value={draft}
					oninput={(event) => onDraft(event.currentTarget.value)}
					placeholder="Account name or reason..."
				/>
			</label>
			{#if !!draft}
				<button
					class="TithewoodControl"
					type="button"
					onclick={() => {
						onClear();
						searchInput?.focus();
					}}>Clear</button
				>
			{/if}
			<button class="TithewoodControl" type="button" onclick={onRefresh}
				>Refresh</button
			>
		</div>

		{#if page.entries.length === 0}
			<p class="TreasuryLedger__empty">
				{page.filtered
					? 'No ledger entries match that search.'
					: 'The ledger is empty.'}
			</p>
		{:else}
			<table
				class="TreasuryLedger__table"
				aria-label="Treasury Ledger entries"
			>
				<colgroup>
					<col class="TreasuryLedger__accountColumn" />
					<col class="TreasuryLedger__reasonColumn" />
					<col class="TreasuryLedger__amountColumn" />
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Account</th>
						<th scope="col">Reason</th>
						<th scope="col">Amount</th>
					</tr>
				</thead>
				<tbody>
					{#each page.entries as entry}
						{@const row = projectEntry(entry)}
						<tr>
							<td>{row.account}</td>
							<td>{row.reason}</td>
							<td
								class={`TreasuryLedger__amount TreasuryLedger__amount--${row.tone}`}
							>
								{row.amount}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		<div class="TreasuryLedger__pagination">
			<button
				class="TithewoodControl"
				type="button"
				disabled={page.page <= 1}
				onclick={() => onPage(page.page - 1)}>Newer</button
			>
			<span>Page {page.page}, {page.shown} shown</span>
			<button
				class="TithewoodControl"
				type="button"
				disabled={!page.has_more}
				onclick={() => onPage(page.page + 1)}>Older</button
			>
		</div>
	</section>
{/if}
