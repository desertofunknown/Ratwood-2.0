# Isolated Market quote inspector checks

Run from `tgui`:

    bun prototypes/market-quote/tests/run.ts

The runner starts independent Bun processes and browser-condition builds. Test sources deliberately do not use default `.test.*` discovery names. Generated files stay in ignored `.generated/` and use explicit filenames, not default test discovery names. No production suite configuration is changed. Requires existing repository frontend dependencies and existing Svelte compiler; installs nothing.

Scope:

- Model derivation compares against actual production `deriveTradeQuoteState`, `computeFillTarget`, and `groupByCategory`, with authored response fixtures, stale correlation dimensions, invalid quantity, rejection, purse/warrant/stockpile and lock behavior.
- A separately mounted actual production `MarketView` records category labels/order and four best/alternative route requests. Both candidate arms compare these limited observations against that record. Management controls are deliberately not exercised.
- The original `steward-trade-modal.test.tsx` executes in its own process as a source regression baseline. It is not a full candidate DOM parity oracle.
- Mounted React and Svelte exercise the read-only inspector workflow, empty/decimal raw inputs, explicit fixture delivery, stale details, hidden old prices, fill invalidation, focus/back/Escape/reopen, lock/empty samples, disposal, and network/storage/media tripwires.
- Source boundary checks disallow native/backend imports, transaction and stockpile actions, direct network entrypoints and automatic delivery timers.

This is not whole StewardTrade/TradeModal parity, server validation, price computation validation, or real shipment execution. The inspector intentionally combines other-region disclosure per good; the original uses separate import/export disclosures. Only route order/payload semantics are compared. Fixtures are authored data, not a live-economy oracle. No live server, saves or database is touched.
