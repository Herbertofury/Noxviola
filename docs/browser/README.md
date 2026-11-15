# Browser baseline and next gates

## Provenance

Browser lifecycle patterns (persistent WebContentsView tabs, sandbox/isolation, navigation events, split surfaces and download handling) are adapted from [Enderloom main.js at 64d6608](https://github.com/Herbertofury/Enderloom/blob/64d6608269021852a419ba19b4f94ed014547ba5/main.js), GPL-3.0-only. Enderloom is preserved. This is a browser-only adaptation, not a full extraction or parity claim. No Minecraft catalogs, third-party artwork, installed profiles, accounts or native launcher dependencies were copied.

Ferrum's [requirements](https://github.com/Herbertofury/Ferrum-Browser/blob/main/README.md) inform optional agent tooling: isolated persistent profiles, deterministic controls, restart/replay evidence, compact results and reproducible comparisons. Its multiple runtimes and QA foundations are not bundled. Earlier consumer wishlist recovery remains open.

## Verified here

Seven Node tests: named identity persistence; address protocol filtering; complete 100-tab duplicate-preserving restore; malformed tab isolation; durable checkpoint fallback; complete private vault metadata restart; rejection/preservation of invalid vault data. JavaScript syntax checks pass. No native Electron binary exists in the available installed dependency, so native startup, web navigation, download/save dialogs, real split views and renderer integration remain unverified. No speed or disk superiority is claimed.

## Prime feature: private media/favorites vault

Implemented local metadata: website/image/video/creator/character, source URL, title, collection, character names, notes, favorite, search and JSON export. No automatic scraping, thumbnails, cloud sync, paywall access or downloads. Next: edit/import with validation, creator/site/link relationships, verified public thumbnails with explicit access state, optional original-media retention with rights checks, encrypted/private backups and user-controlled sync. Do not expose vault files, logs, credentials or private fixtures publicly.

## Next concrete milestones

1. Run actual desktop baseline; test interrupted/repeated navigation, duplicate tabs, >12 tabs, crash recovery, split, download cancel and vault save/search/export/restart.
2. Port filtering and translation with upstream licenses, permissions and actual network behavior verified. Build site permission controls and per-origin revocation; review privileged IPC and untrusted content threat model.
3. Native Firefox-inspired customizable chrome, vertical/horizontal tabs, keyboard layout and theme modules. Design an original purple fox later; no borrowed trademark assets.
4. Browser feature matrix for Opera GX/Chrome/Firefox/Edge: each requested capability needs implementation state, equivalence/limitations and acceptance test. Proprietary cloud services and extension engines are not automatically portable.
5. Evaluate Rust-owned state/services and a Rust/WebView2 contender on Windows; Servo remains isolated pending arbitrary-web correctness/security. Measure cold/warm startup, total runtime/profile disk, full-process memory, input/scroll tails, 1/10/50/100-tab workloads and battery/CPU with complete functionality. Do not market installer-only size as total footprint.

Official engine limits: [Electron extensions](https://www.electronjs.org/docs/latest/api/extensions), [security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri platform engines](https://v2.tauri.app/reference/webview-versions/), [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Servo pre-1.0/LTS](https://book.servo.org/embedding/lts-release.html). Reviewed 2026-11-15.

## Named profile/container baseline
Each tab retains an identity ID. Each identity maps to its own Electron persistent session partition; switching selects an existing identity tab or opens one, without moving cookies between partitions. Split view can display different identities simultaneously. Names survive restart. This is source-level partition wiring, not a native no-leak result: cookies, localStorage, IndexedDB, service workers, cache and authenticated-account separation still need controlled real Electron tests. No passwords or profiles are imported, copied or exported. The shared private vault is explicitly app-wide.
