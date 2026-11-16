# Electron browser architecture and next gates

The current [master goal](MASTER-GOAL.md) resumes PR #5 and explicitly requires **Electron first, complete functionality first, universal extensions as a flagship feature, and Rust only if proven superior**. The separate PR #6 native candidate remains preserved. It is not the active replacement for this browser. The [capability ledger](../browser-capabilities.md) tracks the four-browser union without a count cap or premature completion claims.

## Provenance

Browser lifecycle patterns (persistent WebContentsView tabs, sandbox/isolation, navigation events, split surfaces and download handling) are adapted from [Enderloom main.js at 64d6608](https://github.com/Herbertofury/Enderloom/blob/64d6608269021852a419ba19b4f94ed014547ba5/main.js), GPL-3.0-only. Enderloom is preserved. This is a browser-only adaptation, not a full extraction or parity claim. No Minecraft catalogs, third-party artwork, installed profiles, accounts or native launcher dependencies were copied.

Ferrum's [requirements](https://github.com/Herbertofury/Ferrum-Browser/blob/main/README.md) inform optional agent tooling: isolated persistent profiles, deterministic controls, restart/replay evidence, compact results and reproducible comparisons. Its multiple runtimes and QA foundations are not bundled. Earlier consumer wishlist recovery remains open.

## Current source and evidence boundaries

The active package pins Electron **44.11.3**. Portable tests cover state, vault/account data, explicit recovery, coalesced persistence, permission policy, download events, extension package/lifecycle contracts, packaging and renderer behavior. These tests include synthetic adapters and DOM execution; they do not establish native website/media, partition isolation or extension compatibility. Use `npm test` and `npm run check` for the current suite rather than treating a historical test count as the current receipt.

`npm run test:native` is a separate sandboxed Electron gate using a fresh synthetic profile, a legacy-session seed and two actual source-app launches. Published checkpoint `0c25987e` passed the recorded source and actual packaged-executable workflows on Windows and Linux; the [checkpoint](CHECKPOINT-2026-11-15.md) retains exact results and earlier failures. This workspace does not run Electron. The second gate launches the actual packaged executable, outside the checkout, through its unchanged production entry. Its two normal launches cover product forms, persistence, bounded public HTTPS pages and explicit network/resource observations. New durable-history and page-tools changes remain unqualified until their own hosted receipts pass. See [the harness scope](../../tests/native/README.md) and [release gates](RELEASES.md). No speed or disk superiority is claimed.

Historical evidence is preserved: the earlier baseline downloaded official Electron **44.4.5** Linux x64, verified SHA-256 `04586a0ec46c3283fbdaef85530f561f71f0b5e136ad0cb9ef63683615609780`, and observed its version command. Its sandbox-enabled headless attempt failed at `process_singleton_posix.cc socket() failed: Operation not permitted`, exit 133. That is a denied/failed historical route, not native acceptance. This continuation does not bypass or repeat that route.

## Service ownership

| Source | Responsibility |
| --- | --- |
| `browser/main.cjs` | Trusted browser commands, WebContentsView/tab lifecycle, identity sessions, native dialogs and close coordination. |
| `browser/state.cjs`, `session-writer.cjs`, `storage.cjs` | Session validation, coalesced durable writes, regular-file checks, previous checkpoints and explicit byte-bound recovery. |
| `browser/vault.cjs`, `accounts.cjs` | Local reference library and metadata-only account atlas. |
| `browser/service-store.cjs`, `history.cjs`, `bookmarks.cjs`, `workspaces.cjs` | Durable identity-scoped history and bookmark trees; shared workspace/group definitions, using the existing checkpoint primitives. |
| `browser/preferences.cjs`, `resources.cjs` | Validated independent presentation/shortcut preferences and portable presets; explicit whole-process resource samples without a monitoring timer. |
| `browser/permissions.cjs` | Site permission consent, exact identity/origin scope, document lifetime and durable decisions. |
| `browser/downloads.cjs` | Canonical native download state/actions, durable local history, terminal cancellation, metadata-only removal and explicit recovery. |
| `browser/extensions.cjs` | Canonical extension package inspection, consent, owned bytes and persistent per-identity lifecycle. |
| `browser/extension-bridge.cjs`, `extension-policy.cjs`, `extension-menus.cjs`, `extension-api.preload.cjs` | Native-frame/worker authentication, per-enrollment admission, host API semantics, menus/actions and callback/Promise adaptation. |
| `browser/index.html`, `renderer.js`, `style.css`, `preload.cjs` | Browser chrome, thin trusted IPC bridge and user-facing workflows. Remote pages do not receive this bridge. |
| `browser/capabilities.json` | Versioned target/implementation/evidence ledger, loaded when its panel is explicitly opened. |

The extension bridge uses the same tab, history and bookmark services as the product interface. Its permissions come from the actual extension frame or worker, exact native Session and current enrollment, with revocation checked again before asynchronous replies. It does not let an IPC payload select another extension principal. The [extension architecture audit](EXTENSION-ARCHITECTURE.md) records the maintained upstream architecture, the Mozilla Promise adapter, implemented API boundaries and runtime evidence still required.

## Everyday browsing and independent customization

History records committed HTTP(S) visits per identity, with search, visit removal and independent recording/retention controls. Bookmark folders support create/edit/move/remove, protected roots and an optional bar. Workspace and group definitions persist stable IDs; assigning a tab changes its organization while retaining its browsing identity. Tab context menus expose pin, mute, move and workspace assignment. Collapsed groups keep the active tab reachable. See [service behavior and storage](HISTORY-BOOKMARKS-WORKSPACES.md).

Preferences independently select light/dark/system appearance, accent, density, horizontal/vertical tabs, toolbar visibility, a home page, built-in/custom search and individual shortcuts. Presets have an explicit review/apply workflow. Find previous/next, bounded persistent site zoom, print, PDF, visible screenshots, fullscreen and developer tools are connected to actual native actions. The resource panel samples native process metrics only when opened or refreshed; missing measurements remain unknown. See [customization and resource behavior](CUSTOMIZATION.md) for scope and acceptance boundaries.

[Download history](DOWNLOADS.md) uses the same canonical atomic checkpoint service as the other local stores. Live transfers remain controllable when history saving fails; pending records, Retry and exact-byte recovery are explicit. Completed/cancelled records survive restart, while unfinished old records report interruption without manufacturing a native item or resume capability. The app-wide list retains identity attribution. Clearing one identity removes metadata only and preserves files and other identities' records.

## Prime feature: private media/favorites vault

Implemented local metadata: website/image/video/creator/character, source URL, title, collection, character names, notes, favorite, search, editing, reversible archive, JSON export and reviewed JSON import with exact-duplicate skipping and deterministic collision remapping. Storage preserves corrupt/future data and uses explicit recovery. The prior source-app fixtures exercised add/edit/archive/export/preview/import and restart; native OS picker interaction remains open. Creator/site/link relationships, public thumbnails, optional original-media retention, encryption and controlled sync remain additional features. No automatic scraping, cloud sync or media download is implied. Do not expose vault files, logs, credentials or private fixtures publicly.

## Next concrete milestones

1. Run the changed source and actual packaged-executable gates on both supported CI hosts, then verify owner-device OS dialogs, split/focus, permissions/media and accessibility. Preserve blocked and failed results accurately.
2. Exercise the new authenticated extension bridge in the actual engine, expand member/lifecycle semantics from concrete failures, and test exact third-party package/version workflows from each target ecosystem. Installation, functional compatibility and signature trust are separate results.
3. Add remaining multi-window, device/display-picker, download-extension and request-filtering semantics through canonical services. Keep unsupported native/browser APIs visibly unresolved.
4. Continue the complete Opera GX/Chrome/Firefox/Edge audit from the initial [searchable inventory](../browser-capabilities-index.md); inspect installed Windows browsers when supported access exists. Preserve unique variants and all unresolved options.
5. Add independently controlled customization and optional services. The existing owner-supplied icon is reused unchanged; provenance is in [the source notices](../../THIRD_PARTY_NOTICES.md). Measure cold/warm startup, total runtime/profile disk, full-process memory, input/scroll tails, representative tab workloads and battery/CPU with equivalent complete functionality. Alternative engines remain evidence-gated candidates.

Official engine limits: [Electron extensions](https://www.electronjs.org/docs/latest/api/extensions), [security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri platform engines](https://v2.tauri.app/reference/webview-versions/), [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Servo pre-1.0/LTS](https://book.servo.org/embedding/lts-release.html). Reviewed 2026-11-15.

## Named profile/container baseline
Each tab retains an identity ID. Each identity maps to its own Electron persistent session partition; switching selects an existing identity tab or opens one, without moving cookies between partitions. Split view can display different identities simultaneously. Names survive restart. The prior recorded Windows/Linux fixtures verified separate cookies, localStorage, IndexedDB, service workers and cache across two identities and a normal process restart, including the Windows path-factory transition. That finite evidence does not qualify every website, real account, historical profile or profile path. No passwords or owner profiles are imported, copied or exported. The shared private vault is explicitly app-wide.

## Account manager direction
The owner-provided offline identity atlas was inspected statically, never executed or copied into public source. It informs platform/account labels, handle-claim status, references, account-created and saved-in-password-manager status, and explicit import/export. Its plaintext metadata backups are not an encrypted credential store. Identity-bound metadata already exists separately from secrets; supported password-manager/OS credential integrations still need origin-bound autofill and lock tests. No passwords, custom encryption, credential grants or account creation are implemented.

Implemented metadata-only account atlas: labels, handles, strict site origins, assigned existing browser identities, account-created/password-manager markers, search, editing, reversible archive and open-in-assigned-identity routing. Stored locally in private-accounts.json with previous checkpoint; malformed data is not overwritten. Unknown fields including password/token/cookie/TOTP are rejected. Secret-bearing URL credentials, query strings and fragments are rejected; free-text labels/handles must still never contain secrets. This is not encryption, guaranteed secret detection, autofill, login or vetted password-manager integration. Public fixtures contain only synthetic example.com metadata.

The Browser contracts workflow runs portable Node tests and syntax with locked development dependencies on Windows/Linux. The separate native workflow does not turn mock or DOM coverage into Electron acceptance. Native success requires its own actual result on a supported host; no posted workflow link is evidence that a job has passed. The denied native-launch route was not retried.
