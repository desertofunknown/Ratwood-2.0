# Alert prompt differential harness

Run `bun tgui/prototypes/alert-prompt/tests/run.ts` from the repository root.
The explicit runner executes model/source contracts, the real production oracle,
then each candidate in separate Bun test processes. These filenames intentionally
avoid the repository's default test discovery. Generated artifacts are disposable.

The oracle mounts the real `AlertModal`, real backend reducer/store/actions,
repository Button adapter, upstream core Button/Autofocus/Stack, and real Loader.
Only Window chrome is mocked. No candidate module is imported into the oracle.
Production native action calls are intercepted in-process, never sent to a host.
Candidate compilation rejects production backend/layout/entry/assets imports.
Network, storage, worker, media and beacon tripwires fail on attempted effects.

Both candidates replay 26 matched scenarios / 117 observations: initial selection;
left/right and Shift-Tab modulo navigation; DOM focus versus selected choice;
Enter/Space prevention and one action per dispatched event; Escape without
prevention; unchanged modifier/repeat policy; ignored Up/Down; exact case,
whitespace, duplicate and empty payloads; empty arrays; shorter replacement
buttons preserving an out-of-range selected index; verbose threshold transitions
remounting focused choices without resetting selection; omitted defaults and
truthy numeric flags; layout thresholds at 18/19
characters and four choices; large/swapped flags; delivered-only timeout;
autofocus toggling and ordinary delivery preserving focus. Candidate-only tests
cover local Close, stale actions, unmount cleanup and native-host fail-closed guards.

Layout records normalize production Stack/Button classes and candidate footer
attributes into semantic flags. They do not claim pixel/screenshot equivalence.
Autofocus observations wait for its real effect and timer; source contracts pin
the upstream one-millisecond timer and cleanup. Wall-clock precision is not claimed.
Keyboard tests dispatch synthetic cancelable events in Happy DOM. In particular,
candidates use native buttons while production uses div role=button controls;
these tests do NOT prove browser-generated native click defaults, a real WebView,
BYOND integration, DM runtime semantics, or live-server safety. No live runtime is
started. Source contracts document unchanged DM exact membership checks,
two/three-choice native fallback, server timer, and Window suspend vs cancel.
