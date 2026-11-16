# Find result lifecycle correction

The current native `found-in-page` handler forwarded every result from the active
tab, including superseded requests and results delivered after Find was cleared.
The new per-WebContents request fence forwards only the currently issued request.
Clear invalidates before calling native stop, so reentrant events are stale too.
There is no change to query text, native search semantics, feature scope or stored
user data. The WeakMap adds constant-time request identity checks without retaining
destroyed WebContents. No performance improvement is claimed.

Validation: 370 portable tests pass; 94 JavaScript files pass syntax checking.
Three focused regressions cover replacement, clear/reentrancy, per-WebContents
isolation and failed requests. The native page-tools test now replays a captured
real native result after clear through the production handler and requires no
republication. This deterministic event replay is not an assertion that native
Chromium always exhibits that event ordering.

Local native execution is blocked: after removing Node/Electron environment
overrides for the child test process, the supported harness reports no Linux
desktop display. Windows/Linux hosted native checks remain required. No sandbox
disabling or headless substitute was used. Existing full-parity gates stay open.
