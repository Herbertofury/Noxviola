# Explicit Electron acceptance gate

Run `npm ci`, `npm test`, `npm run check`, then:

```sh
npm run test:native
```

The native command is separate from contract tests and packaging. Exit **0**
means the recorded real-runtime fixture workflows passed; **1** means a test or
launch failed; **2** means the environment blocked the attempt before a runtime
acceptance result. A blocked native command never becomes a passing test.

`-- --output /absolute/evidence/directory` selects a different receipt location.
The default is `native-results/`. Each run gets a fresh `run-*` directory with
`acceptance.json`, per-launch JSON and logs, and actual shell screenshots only
if the runtime reaches capture. Prior runs remain separate and are never
mistaken for current-run screenshots or receipts.
The receipt records recursive application and asset hashes, both package
manifests, the wrapper, driver and fixture hashes, the source commit and whether
the checkout contains uncommitted changes. A successful run also verifies these
inputs stayed unchanged across both launches. Existing browser profiles are never
used. Generated profile data is removed after the run; it is not an artifact.

## What executes

The test-only Electron entry sets a freshly created, marked temporary userData
and session-data directory, forces `app.enableSandbox()`, and imports the actual
`browser/main.cjs`. Browser actions go through the actual sandboxed shell's
preload and trusted IPC handler. No test command or debugger server is added to
the application, and the driver/fixtures are excluded from preview packages.

Two actual Electron processes exercise:

- Navigation, redirects, back/forward and real fixture documents.
- More than twelve instantiated tabs, duplicate URLs, close/reopen and split
  view bounds.
- The same loopback origin in two identities: cookies, localStorage, IndexedDB,
  caches and service-worker registrations, including restart.
- A denied geolocation request through application permission handling.
- Actual DownloadItem completion, bytes, pause/resume and cancellation through
  the application's download commands.
- MV3 content-script execution and `chrome.storage.local` across identities,
  disable/re-enable and process restart.
- A separate MV2 background page responding through `runtime.sendMessage`,
  destruction on disable and restoration on re-enable/restart.
- Uninstall followed by fresh navigation, proving future injection and the
  background context stop. This does not claim stored extension data was erased.
- Library editing, archive/restore, export, import preview/cancel/merge and
  complete metadata recovery after a real process restart.

Only generated fixture sites, extensions and data are used. The test supplies
the file-picker result for its extension folder, selects a synthetic download
path synchronously in `will-download`, and chooses Deny for permission dialogs.
It therefore does **not** verify interaction with native OS dialogs. Internet
site compatibility, account sessions, arbitrary third-party extensions,
cross-browser parity, full security, first-party telemetry/network behavior,
accessibility and performance qualification remain separate acceptance work.

The optional native gate records `app.getAppMetrics()` for every reported
process at blank/restored startup, more than twelve loaded tabs, extension
enable/disable/uninstall milestones, and before normal close. Receipts preserve
the raw counters and units: Electron memory fields are kilobytes; CPU usage is
an interval percentage, cumulative CPU time is seconds when available, and
process creation time is milliseconds since the epoch. These synthetic samples
do not establish comparative efficiency, idle resource use or latency. Shared
resident memory is not summed, and each API call resets CPU sampling intervals.
Check durations measure the harness operation, not browser startup or user
interaction latency. There is no new polling or telemetry in production code.

The fixture uses Electron's documented [sandbox API](https://www.electronjs.org/docs/latest/api/app#appenablesandbox),
[View bounds](https://www.electronjs.org/docs/latest/api/view),
[session extensions](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions-api.md)
and [version-specific extension subset](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md).
The latter documents Manifest V2 background pages. The MV3 fixture has no
background worker; these tests make no MV3 service-worker compatibility claim.

## Runtime prerequisites and recorded blocker

Use an ordinary desktop user on a supported Windows/macOS/Linux environment.
Linux requires a display; CI supplies a normal Xvfb display on Ubuntu 22.04.
The harness refuses root Linux execution, `NODE_OPTIONS`, Electron Node-mode or
sandbox-disable overrides. It never adds sandbox-disable switches, changes
kernel/AppArmor policy, makes a helper setuid, or elevates privileges.

On the November 15, 2026 development host, both `DISPLAY` and
`WAYLAND_DISPLAY` are absent and no Xvfb executable is installed. The preflight
records this as blocked before starting Electron. The earlier PR #5
sandbox-enabled headless attempt's socket `Operation not permitted` failure is
preserved in the project history; that route was not retried. The separate
Servo execution denial is likewise not bypassed by this gate.

The `browser-native.yml` workflow runs the actual gate on Windows and Linux
when relevant files are pushed to `browser/enderloom-baseline-20261115`, or when
manually dispatched. It retains evidence even on failure. It has no
`continue-on-error` acceptance path and no release or merge permissions. A
workflow definition is not evidence that a hosted native run has passed.

## Electron version decision, November 15, 2026

The existing 44.4.5 pin predates Electron's own
[eMudhra certificate mitigation](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
(44.9.1) and [pointer-lock attribution fix](https://github.com/electron/electron/security/advisories/GHSA-x562-297c-g43g)
(44.5.0). This checkpoint pins the current supported 44 branch release,
[44.11.3](https://releases.electronjs.org/release/v44.11.3), with Chromium
152.0.7977.169 and Node 24.22.2. Its release includes additional upstream fixes.

[45.3.3](https://releases.electronjs.org/release/v45.3.3) is the current stable
major candidate. It is retained for comparison rather than promoted without
real navigation/extension/persistence compatibility evidence. Updating the 44
pin addresses known upstream fixes; it is not a claim of native acceptance or
complete browser security.
