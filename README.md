# Noxviola

A customizable browser and local favorites vault, continuing Enderloom's working Electron/Chromium browser model. The product goal is the complete useful feature union of Opera GX, Chrome, Firefox and Edge, with universal extensions, independent customization, zero first-party telemetry and measured efficiency. **This is an experimental 0.1 browser; those final goals are not yet achieved.**

**Electron first. Continue PR #5.** The owner's [master development directive](docs/browser/MASTER-GOAL.md) is preserved unchanged. Rust and other host architectures remain candidates only when complete-work evidence proves an improvement without sacrificing useful behavior. The separate [native PR #6](https://github.com/Herbertofury/Noxviola/pull/6) checkpoint is preserved; it is not the active replacement for this browser.

## Project hub

[Current architecture and provenance](docs/browser/README.md) · [Capability inventory](docs/browser-capabilities.md) · [Searchable capability index](docs/browser-capabilities-index.md) · [Extension architecture](docs/browser/EXTENSION-ARCHITECTURE.md) · [Build and release gates](docs/browser/RELEASES.md) · [Privacy boundaries](docs/browser/PRIVACY.md)

[Contract checks](https://github.com/Herbertofury/Noxviola/actions/workflows/browser-contracts.yml) · [Native acceptance workflow](https://github.com/Herbertofury/Noxviola/actions/workflows/browser-native.yml) · [Preview build jobs](https://github.com/Herbertofury/Noxviola/actions/workflows/preview-builds.yml) · [Releases](https://github.com/Herbertofury/Noxviola/releases)

No production release is qualified. A workflow link or package build is not evidence that it ran successfully. Packaging-only jobs produce unsigned **UNVERIFIED** artifacts; the separately tested **PREVIEW** builds and their bounded native receipts are recorded in [release status](docs/browser/RELEASES.md). Full security, compatibility and performance qualification remains open.

## Run and verify the source

Use a Node version matching `package.json`: **22.22.2 or newer within Node 22, 24.15.0 or newer within Node 24, or Node 26+**. The lockfile pins Electron **44.11.3**, the preview packager and test dependencies.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run setup:electron
npm run check:electron
npm start
```

`setup:electron` runs the official installer bundled in the pinned Electron
package; it downloads and verifies the distribution without launching it.
`check:electron` checks the installed version and executable file without
execution. Electron 44.11.3 has no npm postinstall hook, so `npm ci` alone does
not provision the binary. Keep this setup explicit before source launch or the
native acceptance gate. Portable tests and packaging do not require this step.

The native gate is separate from portable tests and packaging:

```sh
npm run test:native
npm run package:preview
```

`test:native` uses sandboxed Electron, a fresh synthetic profile and local fixtures. A separate process first seeds site data through the original identity storage route; two actual Noxviola processes then exercise readback, browsing and restart. Exit 0 means the recorded fixture workflows passed, exit 1 means failure and exit 2 means the environment blocked execution. It never disables the sandbox or substitutes a mock for native success. The current workspace lacks a supported desktop display, so native acceptance remains blocked here. Actual hosted results and their limits are recorded in the [continuation checkpoint](docs/browser/CHECKPOINT-2026-11-15.md). The earlier socket-denied launch route is preserved and has not been bypassed.

**Verified hosted checkpoint:** source [`0c25987e`](https://github.com/Herbertofury/Noxviola/commit/0c25987e7e14cdc78790d8a9423962346b8fa3a9) passed the [Windows/Linux native workflow](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365), including the original-factory seed, two source-app processes, two ordinary packaged processes, public RFC/MDN HTTPS cases, native OS close/save and complete portable archive verification. Its [contract run](https://github.com/Herbertofury/Noxviola/actions/runs/43780308394) covers 269 portable tests and 71 syntax checks. Earlier failed and passed receipts are preserved in the [continuation checkpoint](docs/browser/CHECKPOINT-2026-11-15.md). The new durable download-history and page-tools checks require their own later native result; real third-party extension functionality, broad Internet/account compatibility, native OS dialogs and all complete product gates remain open.

## Workflows present in source

| Area | Current implementation | Remaining boundary |
| --- | --- | --- |
| Browsing | Address/search, navigation, stop/reload, find, zoom, duplicate/close/reopen tabs, configurable horizontal/vertical layout and two-page split. Native generated-site navigation, history, 16 live tabs, split bounds and bounded public RFC/MDN HTTPS cases passed. | Broader site/account compatibility, focus/resize/accessibility and owner-device acceptance; new native page-tool checks remain pending. |
| Identities | Named persistent identities, identity-bound tabs and side-by-side identities. Native cookie, localStorage, IndexedDB, cache and service-worker separation/readback passed. | Authenticated accounts, arbitrary historical profiles/filesystems and broader isolation/security acceptance. |
| Sessions | Complete ordered tab metadata, duplicate URLs, deferred inactive-tab loading, atomic checkpoints, explicit recovery and save-failure close handling. Native normal-close and restart preservation passed. | Forced crash/power loss, failing shutdown and long-session acceptance. |
| Favorites vault | Website/image/video/creator/character references, collections, names, notes, favorite, search, edit, reversible archive, export and reviewed collision-safe JSON import. | Richer bookmark/media workflows, encryption and optional sync remain separate features. |
| Account atlas | Site origins, labels/handles, identity associations, tracking markers, edit/archive and open in the selected identity. | It is plaintext metadata, not a password manager, login or autofill implementation. |
| Site permissions | Explicit prompts, document-only or durable decisions, separate camera/microphone grants, identity/requesting/embedding origin scope, review/revoke/reset and recovery. | Device/display pickers, extension-origin grants, OS behavior and native ongoing-capture revocation. |
| Downloads | Native destination chooser, identity-tagged progress, pause/resume/cancel, completed-file reveal and close handling. New [durable history](docs/browser/DOWNLOADS.md) preserves records and files, supports explicit recovery and identity-scoped metadata clearing, and waits for real terminal cancellation before close. | Existing native transfer controls/bytes passed; new history/restart coverage is pending. Native OS chooser interaction, cross-process resume and terminal retry remain open. |
| Extensions | Inspected local unpacked/ZIP/XPI imports, explicit permission/identity consent, persistent lifecycle, authenticated canonical host APIs, actual action PNG/ImageData icons and reviewed Chromium/Firefox profiles. Real renderer installation, MV3 content/storage and MV2 background fixtures passed lifecycle/restart/uninstall. | Publisher signatures, CRX, verified updates, MV3 workers, complete API semantics and real cross-browser extension functionality. The separate unchanged Dark Reader gate is still failing. |
| Local spelling | Independent checking preference across the shell and identity Sessions, preserved across restart, with native correction suggestions. Source controls and Session state passed on both hosted platforms. | Dictionary-download consent is unresolved: turning checking off does not block the engine's dictionary downloads. OS-specific correction interaction remains separately unqualified. |

Local JSON data lives in Electron's per-user application-data directory, outside this repository. The favorites library is app-wide. It stores references and metadata, without automatic scraping, media copying or cloud uploads. Export and import use explicit local file selection.

## Universal extensions: target and current evidence

Electron's built-in extension API is incomplete. A package loading successfully does not mean its intended features work. The extension manager reports actual load/unload errors and retains explicit unverified compatibility status. CRX is blocked pending signature verification; XPI/ZIP imports are disclosed as unsigned and do not acquire marketplace trust by being extracted.

A maintained `electron-chrome-extensions` candidate was inspected rather than replaced with superficial API shims. Its real services offer a reuse path, but the exact inspected version has permission and dispatch gaps that must be repaired before adoption. See the [host comparison and next gate](docs/browser-capabilities-extension-hosts.md) and [artifact-level audit](docs/browser/EXTENSION-ARCHITECTURE.md).

## Complete feature target, honest progress

The [canonical capability JSON](browser/capabilities.json) currently expands **183 behavior records and 135 sources**, plus discovery queues. It includes unique browser variants, dependencies, ownership, privacy/performance implications and acceptance procedures. This is an initial documented inventory, not an exhaustive audit or a feature cap. The user's installed Windows browser versions and settings remain uninspected. All master-goal gates G001–G012 remain open.

There is no claim that this preview is faster, smaller, more secure or more capable than the reference browsers. Whole-process performance and zero-first-party-telemetry claims need real workload and network evidence. Optional services, themes and future AI features must remain independently controlled; features may not be removed merely to improve a benchmark.

The visual direction is purple and adaptable. The existing owner-supplied fox-and-globe PNG is reused unchanged, with its source and digest recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No new artwork was generated. Enderloom's source and GPL provenance remain preserved.

[Assistant's consolidated backlog](https://github.com/Herbertofury/Noxviola/wiki/Assistant%E2%80%90Backlog) retains project continuity. Older index files remain historical records. Held [PR #4](https://github.com/Herbertofury/Noxviola/pull/4), its denials and unrelated pauses remain untouched. This continuation does not authorize merging PR #5 or PR #4.
