# Disconnected market and shipment quote study

A read-only workflow study: browse goods, compare regions, inspect a recorded
shipment quote. Matched React and Svelte views share existing Tithewood prototype
tokens and actual production quote derivation helpers. This is not a full
StewardTrade replacement and does not activate a game route.

## Run and build

From `tgui`, with the existing project dependencies and Bun:

```sh
bun prototypes/market-quote/check.ts
bun prototypes/market-quote/tests/run.ts
bun prototypes/market-quote/build.ts
```

Generated output is ignored. `dist/manifest.json` records exact build inputs,
production source provenance and dependency licenses. Distribution must retain
LICENSE.txt, notices, dependency licenses, exact corresponding source and build
instructions. No fonts, images, new dependencies or production bundle entrypoints
are added. Prior prototype sources and hosted routes remain unchanged.

The generated React and Svelte routes use the same authored data and shared CSS.
CSP denies connections, workers, fonts, images and objects; the established
native-endpoint guard rejects host contexts. The build rejects native backend,
layout and entry imports. Those are source/build constraints, not independent
network-capture evidence.

## What is real, and what is a sample

The candidate imports the actual pure production implementations of
[`deriveTradeQuoteState` and `computeFillTarget`](../../packages/tgui/interfaces/StewardTrade/tradeQuote.ts)
and [`groupByCategory`](../../packages/tgui/interfaces/StewardTrade/helpers.ts),
using the existing [`types`](../../packages/tgui/interfaces/StewardTrade/types.ts).
Labels and accounting follow [`MarketView`](../../packages/tgui/interfaces/StewardTrade/MarketView.tsx)
and [`TradeModal`](../../packages/tgui/interfaces/StewardTrade/TradeModal.tsx).

The catalog, prices, treasury, stock, capacity and successful quote records are
explicit examples, not computed from the game economy. Only listed quantities
have a recorded quote. Unlisted quantities return a clearly identified sample
unavailability response, not an assertion about what the real server permits.
The visible controls explicitly deliver a current, stale or rejected sample.
There is no automatic request, simulated latency, server acknowledgement,
reservation, actual transaction, preference saving or background economic model.

The inspector shares exact quote-correlation and disabled-reason derivation:
request ID, side, region, good, and successful quantity must match. Rejections
follow the existing matching rules. Cached capacity/stock may remain visible but
cannot make stale prices or totals current. Export's first accepted response can
fill quantity and create a new draft requiring a fresh recorded response. Purse,
warrant, stock, fill limits and sequestration use the production helpers. A
blockade is shown as a warning, not an invented universal prohibition.

This read-only study intentionally combines buy/sell alternatives into one
per-good disclosure, retains the catalog above an inline quote inspector, and
restores its initiating control on Back. It does not reproduce the whole
production modal or its 120 ms automatic transport debounce. Stockpile management,
bulk export, automatic imports, loans, commissions and shipment submission are
outside the study. The only transaction affordance is permanently disabled and
labeled “Preview only · no trade”.

## A quote request is not a price lock

The producer and actions are in
[`steward_trade_tgui.dm`](../../../code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm)
and [`steward.dm`](../../../code/modules/roguetown/roguemachine/steward/steward.dm).
The live `trade_import` / `trade_export` actions pass region, good and quantity,
not an accepted quote ID or price revision. The server recalculates current
conditions. A draft request ID is correlation, not a reservation or guaranteed
price. Neither a current-looking sample quote nor this UI changes that authority.
Any future accepted-price protocol is a separate backend design/review task.

## Preview checks and rollout limits

Choose a scenario, inspect a buy/sell region, then explicitly deliver its recorded
quote. Change quantity and verify old totals become unavailable until matching
response delivery. Try stale/rejected samples, Fill and export auto-fill, purse
and warrant failures, blockade alternatives, empty markets/stockpiles, and
sequestration entry/release. Back preserves browsing state; Close/Reopen starts a
fresh local session. Test full names, category/region disclosure, keyboard focus,
narrow width and zoom in both arms. Hide harness controls for unobstructed views;
reload restores them.

Mounted tests and pure-helper/source contracts are not native BYOND acceptance.
Real embedded-window transport, proximity/role/lock checks, economic mutations,
rollback, price recalculation and gameplay remain unexercised. Browser fixture
checks cannot establish those guarantees. Production routing and minimum-client
policy remain untouched. There is no new server-speed, rendering-speed, startup,
memory or framework-win claim in this checkpoint.
