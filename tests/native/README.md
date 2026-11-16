# Explicit Electron acceptance gate

Run `npm ci --ignore-scripts`, `npm test`, `npm run check`, then:

```sh
npm run setup:electron
npm run check:electron
npm run test:native
```

The pinned Electron 44.11.3 npm package has no postinstall hook. The explicit
setup command runs its official `install.js` with bundled checksums; the check
command inspects the downloaded version and executable without starting the
engine. The harness never requires Electron's lazy downloader to hide a missing
distribution. Its first hosted Linux run at commit `6012752` stopped before
launch because `npm ci` had not created `node_modules/electron/path.txt`; that
provisioning failure remains a blocked result, not native acceptance.

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

## Packaged executable acceptance and delivery

The deep source gate below and the packaged gate are separate receipts. To build
and exercise the exact application executable on an ordinary desktop runner:

```sh
npm run package:preview -- --receipt native-results/package.json
npm run test:native -- --package-receipt native-results/package.json --public-https --output native-results/packaged
python tests/native/portable-archive.py --receipt native-results/package.json --output native-results/distribution
```

The package gate requires a clean Git checkpoint and the same platform and
architecture as the runner. Before launch it verifies the complete executable
distribution against `PACKAGE-MANIFEST.json`, the actual ASAR allowlist and file
hashes, the embedded build/source commit, and every production source byte. It
repeats the package verification after both processes exit. It never replaces
the packaged main entry, unpacks/rebuilds the application for testing, imports
the source driver into the package, or uses Electron's Node inspection mode.
The executable runs from a separately verified, byte-identical copy inside the
owned temporary fixture, outside the repository. Its working directory is that
copy and `NODE_PATH` overrides are refused. This prevents an omitted package
dependency from being accidentally satisfied by the checkout's `node_modules`.
The original distribution and executed copy must both remain byte-identical.

The external Node driver starts the real `Noxviola.exe` or `Noxviola` with
Electron's built-in `--user-data-dir` pointing to a newly marked synthetic
profile, `--remote-debugging-port=0`, and a default-mode Chromium NetLog output.
The pinned engine handles the profile switch before application code and binds
its HTTP debugging server to `127.0.0.1`; the harness accepts only the ephemeral
browser endpoint printed by its own child process. It attaches to the real
shell loaded from `resources/app.asar/browser/index.html` and drives its
existing renderer/preload interface. No new production test command or code
loading hook is needed. The normal application does not enable a debug server.
See the pinned engine's
[startup implementation](https://github.com/electron/electron/blob/v44.11.3/shell/app/electron_main_delegate.cc)
and [debug server binding](https://github.com/electron/electron/blob/v44.11.3/shell/browser/ui/devtools_manager_delegate.cc).

The packaged workload covers real navigation/redirect/back/forward, sixteen
loaded tabs with duplicate URLs and close/reopen, split-mode state, two browser
identities with cookies/localStorage/IndexedDB/CacheStorage/service workers,
the actual Library form and rendered saved card, and a second normal process
launch restoring tabs, preferences, identities and full saved Library metadata.
It also checks committed navigation history/title, nested bookmark creation,
editing and movement through the real forms, identity-separated history and
bookmark trees, workspace/group forms and tab assignments, pin/mute state, and
those stable IDs after restart. The actual preferences form switches to vertical
tabs, light/teal/compact appearance and the bookmarks bar; the page's measured
viewport must match the real sidebar and enlarged browser header without losing
any tabs or identity data.
Persistent and session-only cookie lifetimes are checked independently through
the actual renderer cookie jar. The external Python 3 standard-library helper
requests `WM_CLOSE` on Windows or `WM_PROTOCOLS/WM_DELETE_WINDOW` on Linux X11.
It selects only the exact launched browser PID and a unique visible top-level
window, refuses ambiguity, and verifies ownership again before delivery. Linux
uses the runner's existing X11 client library and display; there is no elevated
installation or window/process destruction. The receipt retains the selected
window, PID and native protocol, complete generated expected/pre-close state,
the selected public-page target's actual document metadata, and the session
read after process exit. Clean exit and an immediate exact saved-state comparison
are required before the second launch. There is no test-only storage flush.

Earlier packaged attempts used renderer `window.close()`. Pinned Electron's
[WebContents close implementation](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_web_contents.cc)
destroys that WebContents, after which
[BrowserWindow closes immediately](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_browser_window.cc).
That route bypassed the preventable window-close event and did not qualify the
normal save lifecycle; its failed restart receipts remain preserved. The OS
helper uses the documented [Windows close message](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-close)
or [X11 client close protocol](https://xorg.freedesktop.org/releases/X11R7.7/doc/xorg-docs/icccm/icccm.html).

`--public-https` adds exactly two public documents: RFC Editor's RFC 9110 and
MDN's JavaScript documentation. Each must render the expected document over a
successful secure HTTPS response, with no Node or privileged shell bridge in
the page. Actual screenshots and navigation timing entries are retained. No
account, sign-in, CAPTCHA bypass or certificate exception is used. A timeout,
DNS failure, access-denied page or failed certificate remains a failed gate
with evidence; there is no fallback site or silent skip. These two samples do
not establish general Internet compatibility. Omit this explicit flag only
when intentionally requesting the deterministic loopback-only package gate;
the hosted acceptance workflow includes it.

Network evidence includes every selected CDP request/response/data/finish/error
event for attached page targets, without headers, bodies, URL credentials or
query values. The receipt records attachment boundaries and an explicit
three-second fresh-blank observation window. Default-mode Chromium NetLog runs
from process launch through normal close and is retained separately, with
event counts and URL-origin metadata. Renderer CDP cannot see all engine,
Node or OS traffic; a finite NetLog capture also does not prove universal zero
telemetry or identify every request's purpose. Public pages can initiate their
own third-party requests; those observations are not silently attributed to
Noxviola.

Resource milestones use the real product's on-demand `resource-sample` command,
Chromium `SystemInfo.getProcessInfo`, and per-page `Performance.getMetrics`.
Windows renderer sandbox flags must remain true. CPU intervals, process
working sets, and JS heap/document counters retain their distinct units and
scope. Summing working sets can count shared pages more than once. Instrumented
spawn-to-observed-shell time and navigation timings are observations, not a
calibrated comparative benchmark. No background sampler or production telemetry
is added for these tests. Protocol references:
[SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/),
[Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/), and
[Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/).

After a successful gate, the Python 3 standard-library archive helper creates
one complete Windows ZIP or Linux tar.gz and reads every entry back to verify
the exact file set, lengths and SHA-256 values. Linux executable/helper modes
must also match the original package. It refuses modified packages, links,
special files, duplicate entries and overwriting an existing archive. The
archive includes the Electron runtime and production dependency closure, so an
end user does not need Node or Python to start it. Its `distribution.json`
records complete entry evidence and the archive hash. This is still an unsigned
preview; an actual packaged pass is scoped workflow evidence, not signing,
installer/update, owner-device, security or release qualification.

## What executes in the deep source gate

The test-only Electron entry sets a freshly created, marked temporary userData
and session-data directory, forces `app.enableSandbox()`, and imports the actual
`browser/main.cjs`. Browser actions go through the actual sandboxed shell's
preload and trusted IPC handler. No test command or debugger server is added to
the application, and the driver/fixtures are excluded from preview packages.

One separate sandboxed Electron process first writes generated personal-identity
cookies, localStorage, IndexedDB, CacheStorage and service-worker data using the
original `fromPartition` factory and the same profile and loopback origin. It
creates no compact alias, uses no production resolver and performs no test-only
storage flush. Its receipt must report normal window close and quit, and the
wrapper requires a successful process exit. The first production process then
verifies those values and their original physical directory before writing its
own fixtures. This covers the factory transition on the pinned engine; it does
not certify every historical engine version or existing user profile.

Two subsequent actual Noxviola processes exercise:

- Navigation, redirects, back/forward and real fixture documents.
- More than twelve instantiated tabs, duplicate URLs, close/reopen and split
  view bounds.
- The same loopback origin in two identities: cookies, localStorage, IndexedDB,
  caches and service-worker registrations, including restart. A cookie with
  `Max-Age=86400` must persist, while a separate session-only cookie must expire;
  actual native cookie attributes are checked before close and after restart.
- A denied geolocation request through application permission handling.
- Local spelling starts enabled in the actual default and both initial identity
  Sessions. The real settings checkbox and Save preferences handler disable and
  re-enable checking, a later identity inherits the enabled choice, and a final
  explicit disable is preserved in every Session and the visible control across
  process restart. Native `Session.isSpellCheckerEnabled()` readback verifies the
  local checking state. This is not download consent: the pinned engine can fetch
  dictionaries independently of the checking switch. The separate packaged
  NetLog workload retains its ordinary default behavior and makes no assertion
  that dictionary traffic disappears.
- Actual DownloadItem completion, bytes, pause/resume and cancellation through
  the application's download commands.
- MV3 content-script execution and `chrome.storage.local` across identities,
  disable/re-enable and process restart. Installation uses the actual renderer's
  identity choices, consent checkbox and Install button before the runtime checks.
- A separate MV2 background page responding through `runtime.sendMessage`,
  destruction on disable and restoration on re-enable/restart.
- A third, persistent MV2 host-bridge package, installed through real consent
  in both identities with the visible API behavior profile explicitly set to
  Firefox for its reset semantics. Its actual background exercises Chrome callbacks and the
  browser Promise namespace, first-event registration, stable public tab IDs,
  inactive tab creation/read/update/move/remove and native content messaging,
  durable bookmark events and edits, own-identity cookie writes/readback,
  rejected ungranted hosts and foreign tabs, callback-scoped errors, rejected
  unsupported operations, and real toolbar action title/badge state. Six icon
  stages cover the manifest default, package-path size map, real ImageData,
  tab-specific ImageData, tab reset and global reset. Each stage waits for a
  single content-message acknowledgment only after the driver has decoded every
  actual action-model PNG variant and the visible toolbar image, checked their
  dimensions, pixels and source set, and retained the observation. First-run
  screenshots show each stage. The normal fixture run, re-enable and real restart
  must all retain the reviewed profile and complete the same checks. A target
  content-ready message gates its single message attempt; no retry hides a
  missing receiver. The fixture removes only its own temporary tab/bookmark/
  cookie and verifies all pre-existing ordered tabs remain intact. Disable,
  re-enable, real process restart and uninstall are checked again by the host
  driver. This proves only the enumerated synthetic API paths when the gate
  passes, not full Chrome/Firefox API or arbitrary extension compatibility.
- Uninstall followed by fresh navigation, proving future injection and the
  background context stop. This does not claim stored extension data was erased.
- Library editing, archive/restore, export, import preview/cancel/merge and
  complete metadata recovery after a real process restart.

The driver and application share the same identity Session resolver. Windows
uses its original persistent partition where the pinned cache lifecycle path
budget permits it, or a verified compact junction to that unchanged physical
directory. Both phases record the actual Session path and compare physical
file IDs (or exact canonical paths when IDs are unavailable). The generated
profile stays at its original long location. The original-factory seed,
production readback and production restart exercise generated profiles; they
do not qualify every legacy browser profile, remote filesystem or arbitrarily
long root. Linux keeps its original partition behavior.

Only generated fixture sites, extensions and data are used. The test supplies
the file-picker result for its extension folder, selects a synthetic download
path synchronously in `will-download`, and chooses Deny for permission dialogs.
It therefore does **not** verify interaction with native OS dialogs. Internet
site compatibility, account sessions, arbitrary third-party extensions,
cross-browser parity, full security, first-party telemetry/network behavior,
accessibility and performance qualification remain separate acceptance work.
The extension import and privileged native lifecycle checks in this section
execute in the deep source gate. They are not silently relabeled as packaged
extension acceptance; the external packaged gate above currently does not drive
the native extension-import picker or install these extension fixtures.

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
The harness refuses root Linux execution, `NODE_OPTIONS`, `NODE_PATH`, Electron Node-mode or
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
workflow definition is not evidence that a hosted native run has passed. It
then builds and runs the exact packaged executable on the same runner, verifies
the complete portable archive, and uploads the archive only if all required
gates succeed. Native JSON, screenshots and logs are retained on failure as
well. Source and packaged results remain distinguishable in those artifacts.

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
