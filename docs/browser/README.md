# Electron browser architecture and next gates

The current [master goal](MASTER-GOAL.md) resumes PR #5 and explicitly requires **Electron first, complete functionality first, universal extensions as a flagship feature, and Rust only if proven superior**. The separate PR #6 native candidate remains preserved. It is not the active replacement for this browser. The [capability ledger](../browser-capabilities.md) tracks the four-browser union without a count cap or premature completion claims.

## Provenance

Browser lifecycle patterns (persistent WebContentsView tabs, sandbox/isolation, navigation events, split surfaces and download handling) are adapted from [Enderloom main.js at 64d6608](https://github.com/Herbertofury/Enderloom/blob/64d6608269021852a419ba19b4f94ed014547ba5/main.js), GPL-3.0-only. Enderloom is preserved. This is a browser-only adaptation, not a full extraction or parity claim. No Minecraft catalogs, third-party artwork, installed profiles, accounts or native launcher dependencies were copied.

Ferrum's [requirements](https://github.com/Herbertofury/Ferrum-Browser/blob/main/README.md) inform optional agent tooling: isolated persistent profiles, deterministic controls, restart/replay evidence, compact results and reproducible comparisons. Its multiple runtimes and QA foundations are not bundled. Earlier consumer wishlist recovery remains open.

## Current source and evidence boundaries

The active package pins Electron **44.11.3**. Portable tests cover state, vault/account data, explicit recovery, coalesced persistence, permission policy, download events, extension package/lifecycle contracts, packaging and renderer behavior. These tests include synthetic adapters and DOM execution; they do not establish native website/media, partition isolation or extension compatibility. Use `npm test` and `npm run check` for the current suite rather than treating a historical test count as the current receipt.

`npm run test:native` is a separate sandboxed Electron gate using the actual source app, fresh synthetic profiles and two launches. The current workspace preflight reports no supported desktop display and exits blocked before launching Electron. Native OS picker interaction, real internet workflows and production security/performance remain unverified. See [the harness scope](../../tests/native/README.md) and [release gates](RELEASES.md). No speed or disk superiority is claimed.

Historical evidence is preserved: the earlier baseline downloaded official Electron **44.4.5** Linux x64, verified SHA-256 `04586a0ec46c3283fbdaef85530f561f71f0b5e136ad0cb9ef63683615609780`, and observed its version command. Its sandbox-enabled headless attempt failed at `process_singleton_posix.cc socket() failed: Operation not permitted`, exit 133. That is a denied/failed historical route, not native acceptance. This continuation does not bypass or repeat that route.

## Service ownership

| Source | Responsibility |
| --- | --- |
| `browser/main.cjs` | Trusted browser commands, WebContentsView/tab lifecycle, identity sessions, native dialogs and close coordination. |
| `browser/state.cjs`, `session-writer.cjs`, `storage.cjs` | Session validation, coalesced durable writes, regular-file checks, previous checkpoints and explicit byte-bound recovery. |
| `browser/vault.cjs`, `accounts.cjs` | Local reference library and metadata-only account atlas. |
| `browser/permissions.cjs` | Site permission consent, exact identity/origin scope, document lifetime and durable decisions. |
| `browser/downloads.cjs` | Canonical current-session download state and actions. |
| `browser/extensions.cjs` | Canonical extension package inspection, consent, owned bytes and persistent per-identity lifecycle. |
| `browser/index.html`, `renderer.js`, `style.css`, `preload.cjs` | Browser chrome, thin trusted IPC bridge and user-facing workflows. Remote pages do not receive this bridge. |
| `browser/capabilities.json` | Versioned target/implementation/evidence ledger, loaded when its panel is explicitly opened. |

These boundaries let future extension APIs reuse the same tab/download/library services instead of creating competing browser state. The [extension architecture audit](EXTENSION-ARCHITECTURE.md) records the maintained adapter candidate and the permission fixes needed before adoption.

## Prime feature: private media/favorites vault

Implemented local metadata: website/image/video/creator/character, source URL, title, collection, character names, notes, favorite, search, editing, reversible archive, JSON export and reviewed JSON import with exact-duplicate skipping and deterministic collision remapping. Storage preserves corrupt/future data and uses explicit recovery. Native add/edit/import/export/restart acceptance remains open. Creator/site/link relationships, public thumbnails, optional original-media retention, encryption and controlled sync remain additional features. No automatic scraping, cloud sync or media download is implied. Do not expose vault files, logs, credentials or private fixtures publicly.

## Next concrete milestones

1. Run the actual supported-desktop gate and manually verify OS dialogs, split/focus, permissions/media, downloads, vault import/export and restart. Preserve blocked and failed results accurately.
2. Harden the inspected maintained extension adapter, bind real APIs to existing services, and test exact package/version workflows from each target ecosystem. Installation, functional compatibility and signature trust are separate results.
3. Expand canonical tab/window, bookmark/history and device/display-picker services so browser UI and extension APIs share actual semantics. Compose request filtering through one policy owner.
4. Continue the complete Opera GX/Chrome/Firefox/Edge audit from the initial [searchable inventory](../browser-capabilities-index.md); inspect installed Windows browsers when supported access exists. Preserve unique variants and all unresolved options.
5. Add independently controlled customization and optional services. The existing owner-supplied icon is reused unchanged; provenance is in [the source notices](../../THIRD_PARTY_NOTICES.md). Measure cold/warm startup, total runtime/profile disk, full-process memory, input/scroll tails, representative tab workloads and battery/CPU with equivalent complete functionality. Alternative engines remain evidence-gated candidates.

Official engine limits: [Electron extensions](https://www.electronjs.org/docs/latest/api/extensions), [security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri platform engines](https://v2.tauri.app/reference/webview-versions/), [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Servo pre-1.0/LTS](https://book.servo.org/embedding/lts-release.html). Reviewed 2026-11-15.

## Named profile/container baseline
Each tab retains an identity ID. Each identity maps to its own Electron persistent session partition; switching selects an existing identity tab or opens one, without moving cookies between partitions. Split view can display different identities simultaneously. Names survive restart. This is source-level partition wiring, not a native no-leak result: cookies, localStorage, IndexedDB, service workers, cache and authenticated-account separation still need controlled real Electron tests. No passwords or profiles are imported, copied or exported. The shared private vault is explicitly app-wide.

## Account manager direction
The owner-provided offline identity atlas was inspected statically, never executed or copied into public source. It informs platform/account labels, handle-claim status, references, account-created and saved-in-password-manager status, and explicit import/export. Its plaintext metadata backups are not an encrypted credential store. Identity-bound metadata already exists separately from secrets; supported password-manager/OS credential integrations still need origin-bound autofill and lock tests. No passwords, custom encryption, credential grants or account creation are implemented.

Implemented metadata-only account atlas: labels, handles, strict site origins, assigned existing browser identities, account-created/password-manager markers, search, editing, reversible archive and open-in-assigned-identity routing. Stored locally in private-accounts.json with previous checkpoint; malformed data is not overwritten. Unknown fields including password/token/cookie/TOTP are rejected. Secret-bearing URL credentials, query strings and fragments are rejected; free-text labels/handles must still never contain secrets. This is not encryption, guaranteed secret detection, autofill, login or vetted password-manager integration. Public fixtures contain only synthetic example.com metadata.

The Browser contracts workflow runs portable Node tests and syntax with locked development dependencies on Windows/Linux. The separate native workflow does not turn mock or DOM coverage into Electron acceptance. Native success requires its own actual result on a supported host; no posted workflow link is evidence that a job has passed. The denied native-launch route was not retried.
