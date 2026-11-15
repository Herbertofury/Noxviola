# Extension management and compatibility checkpoint

Reviewed 2026-11-15 against Electron **44.11.3**, pinned `yauzl` **3.4.0**, and the current local PR #5 continuation. Universal cross-browser extension functionality remains the product target. This checkpoint supplies a real local lifecycle and preserves the unresolved runtime work; installation is never recorded as functional compatibility.

## Implemented boundary

`browser/extensions.cjs` is the canonical package and lifecycle service. Production injects `browser/extension-runtime.cjs` over the real identity `Session.extensions` object; Node contract tests substitute only the native event/adapter boundary. The raw loader default exists for those isolated contract adapters; the desktop shell must inject `createExtensionLoader`. The service does not inject extension API shims, rewrite `browser.*`, contact marketplaces, request updates, or transmit package inventories.

| Workflow | Behavior |
| --- | --- |
| Inspect unpacked directory | Copies regular files into an owned preview, preserves their bytes and case, rejects links/special files and ambiguous portable paths, parses the manifest, lists declared permissions and content-script match patterns, and detects dotted API references without executing the package. |
| Inspect ZIP | Uses the maintained ZIP parser with lazy entry streaming, size verification, additional CRC verification, path/collision checks and available-disk checks. A single enclosing directory may be removed. No source code or manifest is rewritten. |
| Inspect XPI | Uses the same safe package inspection, explicitly labels publisher/signature trust as unverified, retains signature metadata, and requires acceptance as an unsigned local import. This does not validate a Mozilla signature or confer Firefox store trust. |
| Inspect CRX | Refuses installation with `CRX_SIGNATURE_UNVERIFIED`, including a CRX renamed to ZIP. No header stripping or signature bypass. |
| Accept installation | Requires the preview token, explicit permission acceptance and at least one selected existing identity. The accepted copied tree is hashed again. File access defaults off and requires a separate boolean choice. Changed preview bytes cannot reuse consent. |
| Own package | Moves the approved copy to `extensions/packages/<stable UUID>`. Files and directory entries are flushed before registry commitment. The original source may change or disappear without changing the installed package. |
| Enable / disable | Persists explicit per-identity intent. Enabling uses `session.extensions.loadExtension` and waits for a persistent MV2 background document to finish loading when one is declared; disabling uses `removeExtension` and checks `getExtension`. Failed readiness removes the newly loaded runtime. A failed unload is visibly `disable-failed`, with an explicit possibly-still-running error; re-enabling or receiving a registration event cannot relabel that failure as success. |
| Restart | Validates owned package bytes against consent before reloading. The stable owned path preserves the runtime extension identity across restarts. A disabled identity is not loaded. |
| Additional identity | Requires a new explicit acceptance through `authorizeIdentity`; extensions never enroll another identity automatically. Each identity uses its own persistent Electron session and extension storage. |
| Popup / options | `pageFor` accepts only a declared approved local page in a currently loaded, authorized identity. The result must stay in the loaded extension's own `chrome-extension://` host. The browser owns secure window construction and closes these hosts before disabling/uninstalling. |
| Uninstall | Persists disabled intent, unloads each running identity, removes owned package code, then removes the record. Failed unloading or file removal leaves a retryable record. Existing Chromium extension storage is explicitly retained; data erasure is not claimed. |
| Recovery | Malformed, duplicate-key, newer-schema and externally changed registries are not silently replaced. A missing primary with an existing checkpoint requires explicit recovery. An invalid previous checkpoint is preserved. A rename acknowledged with an I/O failure does not cause package rollback beneath a visible registry record. |

Preview acceptance is tied to owned bytes, not to a mutable source path. Packages with the same digest or explicit publisher identity are not installed as competing runtime instances. No arbitrary extension-count or file-count limit is imposed. Windows-ambiguous names, encrypted archives, links and special files are explicit unsupported inputs rather than silently altered packages.

### Startup and activity

`open()` reads metadata only. The desktop shell uses `restoreIdentity(identity)` before loading that identity's first page. Other inactive identities are not initialized implicitly. An explicit install/enable starts the selected identity immediately; `restore()` remains available when all authorized identities should be restored. Repeated restoration recognizes already-loaded instances and does not repeat their disk verification or `loadExtension` call.

There are no manager polling timers or extension monitoring workers. Native load/unload notifications update runtime presence; registration alone cannot assert readiness. Persistent MV2 startup temporarily observes native background contexts and has one 15-second failure deadline after native registration. This is an event-driven readiness check, with no repeated loads or fixed startup delay. All temporary listeners and the deadline are removed after success or failure. Lazy MV2, MV3, and content-only packages retain the native loader's completion semantics.

Disabled extensions have no manager-started runtime; verifying termination of actual background pages/service workers, and the behavior of content scripts already injected into an existing document, requires the separate native fixture. Disabling does not undo an extension's prior DOM changes. Reloading a page is a distinct user action.

### API used by the shell

```js
const {createExtensionLoader} = require('./extension-runtime.cjs');
const manager = new ExtensionManager({
  directory: path.join(userData, 'extensions'),
  getSession: identitySession,
  getIdentities: () => profiles.map(profile => profile.id),
  loadExtension: createExtensionLoader({app, webContents}),
});
await manager.open();
await manager.restoreIdentity(activeIdentity);

const preview = await manager.preview(userSelectedAbsolutePath);
const item = await manager.install(preview.token, {
  identities: selectedIdentities,
  permissionsAccepted: true,
  allowFileAccess: false,
  unsignedImportAccepted: explicitUnsignedImportConsent,
});
await manager.setEnabled(item.id, activeIdentity, false);
await manager.authorizeIdentity(item.id, anotherIdentity, {
  permissionsAccepted: true,
  allowFileAccess: false,
});
const optionsURL = manager.pageFor(item.id, anotherIdentity, 'options');
const snapshot = manager.list();
await manager.uninstall(item.id);
await manager.dispose();
```

The acceptance flags in this example must come from actual user review, not automatic approval. `list()` separates `enabled` intent from `status`, `runtimeId`, and `error` for every identity. `loaded` means the engine confirmed loading and, for a persistent MV2 background, its initial document completed. It does not promise completion of asynchronous extension initialization or establish API compatibility. `compatibility.functionalVerification` remains `not-tested`; a synthetic package passing a native fixture does not prove every extension with similar permissions will function.

## Version-specific runtime evidence

The [44.11.3 extension support document](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md) and [44.11.3 lifecycle API document](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions-api.md) were retrieved from that exact source tag. This matters: the current website already differs from this release in its storage descriptions.

Electron 44.11.3 documents an intentionally incomplete extension API, persistent sessions, explicit loading each application run, unpacked packages, partial tabs semantics, and unsupported `storage.sync` / `storage.managed`. Its documented background manifest support is Manifest V2. A Manifest V3 service worker therefore remains unverified by this documentation and requires an actual pinned-runtime test. Browser-host concepts such as creating Noxviola tabs/windows and complete action behavior need additional integration. An omitted API remains unknown unless a source or a functional test establishes its behavior.

API scanning is advisory: computed calls, aliases, comments, dynamically loaded dependencies and API argument semantics are outside this simple static scan. It is not a claim that all required APIs were found. There is no package allowlist, and the `browser.*` namespace is not rejected wholesale. Exact package/version functionality still needs testing.

### Persistent MV2 ordering repair

The original [Linux native diagnostic job](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107/job/132973578371) at source `6fccdd2382cd36bcdaefb58a41ef898c35aadb87` passed eight native checks, then failed the first one-shot persistent MV2 message with `Could not establish connection. Receiving end does not exist.` The retained artifact is `14182666487`, SHA-256 `ce4be6e21e7e5566f3b17e74726bb207205a58b858a826c9e2f25c8bab02fe0c`. In Electron 44.11.3 / Chromium 152.0.7977.169, the observed `extension-ready` event was at `22:00:38.764Z`; background navigation began at `.767Z` and `did-finish-load` followed at `.800Z`. Post-failure diagnostics found a committed background document and an installed message listener. The failed receipt remains evidence, not a completed acceptance gate.

The [pinned Electron loader](https://github.com/electron/electron/blob/v44.11.3/shell/browser/extensions/electron_extension_loader.cc) resolves after native registration. Chromium's [registrar](https://github.com/chromium/chromium/blob/152.0.7977.169/extensions/browser/extension_registrar.cc) marks the extension ready while [background-host creation](https://github.com/chromium/chromium/blob/152.0.7977.169/extensions/browser/extension_host.cc) may still be queued. Its [message service](https://github.com/chromium/chromium/blob/152.0.7977.169/extensions/browser/api/messaging/message_service.cc) supplies startup queuing for lazy contexts; that does not make a newly registered persistent background listener ready. Waiting for `extension-ready` alone would preserve this race.

The production helper attaches native observers **before** `loadExtension`, retains a completion that arrives before the promise result, and then matches the returned manifest's actual background document. It requires the same Session object, `backgroundPage` type, runtime ID and committed main-frame URL. An initial empty frame, popup/options page, another identity, or a previous host still closing cannot satisfy it. A preexisting host must start a newly observed main-frame navigation before its completion can count. A completed native host discovered after loading is accepted without delaying it. Document failure, renderer crash, destruction, unload and deadline expiration produce explicit errors and enter the manager's real unload/cleanup path.

The helper never evaluates or probes background code, creates a hidden host, or changes sandbox settings. The unchanged native fixture remains the acceptance test for the repair. Background scripts that install listeners only after their own asynchronous work still need an extension-specific functional test. The bounded efficiency check found no reason for polling, repeated native loads or an ongoing observer: already-completed fresh hosts return immediately and existing confirmed manager loads retain their fast path. No end-to-end speedup is claimed; cold-start and whole-process measurements remain pending native evidence.

## Established runtime candidate evaluated

Candidate: [`electron-chrome-extensions` 4.10.0](https://www.npmjs.com/package/electron-chrome-extensions), from [samuelmaddock/electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell). The inspected distribution is MIT-licensed; older indexed README text referring to GPL options is not the license of this verified package.

| Artifact | SHA-256 |
| --- | --- |
| `electron-chrome-extensions-4.10.0.tgz` | `7a9966fbafbf66e44327479684116c921f609c45adc9e878436b151e3586c36a` |
| `package/dist/cjs/index.js` | `d9065e17c44fcc02453eda134f2b8b235a968edb1317bd7195e10ee4d8d5efca` |
| `package/LICENSE.md` | `c8e4420327c053bb685506bffc21bf1126e0bca9ea275aee3cda3cdb711f80d9` |

The downloaded archive also matched the registry SHA-512 integrity value before inspection. It was inspected as source and **not installed or executed** in Noxviola. It has useful real implementations and browser integration hooks, but enabling it unmodified would weaken the permission contract:

| Inspected source | Finding | Required next work |
| --- | --- | --- |
| `dist/cjs/index.js`, `CookiesAPI` around 2024–2079 | Cookie methods register without a required permission option, and handlers directly query/change the identity cookie jar without filtering approved hosts. Cookie change events are broadcast without equivalent admission checks. | Enforce `cookies` plus effective host grants for methods and events; test denial, allowed hosts, optional permission removal and cross-identity isolation using synthetic cookies. |
| `PermissionsAPI.remove` around 2584 | Returns `true` without changing grants or emitting actual revocation behavior. | Implement real revocation and corresponding method/event admission. A success-shaped no-op cannot be adopted. |
| `ExtensionStore.requestPermissions` around 1471 | Returns approval when no host permission callback is supplied. | Require explicit host consent and durable granted scopes; default denial; exercise request cancellation and restart. |
| `ExtensionRouter.onExtensionMessage` around 2460–2480 | Resolves the caller-supplied extension ID against the session, without binding that ID to the sender frame or service-worker origin before dispatch. | Authenticate the actual extension context and session, then authorize each handler. Regression-test forged extension IDs and remote-session action requests. This is a source finding, not a claimed demonstrated exploit. |
| `ExtensionRouter` around 2354–2388 | Deliberately retains background-host and worker references; no complete session disposal API is exposed. | Measure background lifetime and release behavior, test disable/uninstall, and provide lifecycle cleanup before adopting the adapter. |

The next integration should harden this maintained candidate or contribute fixes upstream, then exercise its actual `createTab`, `selectTab`, `removeTab`, `createWindow`, action and event paths against the canonical browser services. Writing superficial replacement API names is not the alternative.

## Verification and remaining acceptance

`node --test tests/extensions.test.cjs` currently covers **28 contract tests**: permission admission, exact copied bytes, additional identity consent, restart and storage separation in the fake adapter, disabled startup, serial lifecycle ordering, load/unload/uninstall failures, stale previews, modified installed bytes, registry corruption/conflicts, invalid UTF-8, ambiguous post-rename failure, source/ZIP symlinks, portable name collisions, traversal, encryption, CRC failure, CRX blocking, unsigned XPI acceptance, native-event observation without bypassing managed readiness, identity-scoped startup, and validated popup/options routes.

`tests/extension-runtime.test.cjs` adds **17 production-loader contracts**: initial-empty/registration/ready/commit ordering, early completion, native loading-flag ordering, already-completed committed documents, identity/runtime/document/type mismatch, old-host replacement and draining, unaffected lazy/MV3/content-only paths, load failure, crash, destruction, unload, a deterministic deadline, observer cleanup, raw native rejection, and actual manager readiness failure/cleanup/re-enable behavior. They use synthetic native events and do not execute Electron or extension code.

`tests/renderer.test.cjs` adds **15 DOM contracts** using the actual production HTML and renderer with only the preload IPC boundary substituted. They cover reviewed package consent and exact selected identities, unsigned XPI acceptance, failed installation versus failed runtime loading, stop retry after failed unload, text escaping, preservation of rejected and newer in-flight drafts, complete tab/collection rendering, panel commands, terminal download controls, permission scope and the real capability inventory. The delayed-reply tests reproduced address/form draft loss before the renderer fix, and the failed-unload test guards the actual manager state where disabled intent coexists with possibly-running code. The combined focused run passed **60/60**. This does not prove native dialogs, CSS layout, extension execution, or Chromium isolation.

These are manager contracts, not real-browser compatibility results. The separate runtime evidence must identify its exact Electron version, generated package and exercised workflows. Real store extensions, broad API coverage, CRX/XPI trust verification, automatic verified updates, migration of settings, workspace/site/temporary scopes, user-facing data erasure, resource attribution, and Windows acceptance remain open. No browser-wide performance advantage is claimed. The bounded efficiency improvements are removal of redundant load calls, streamed package processing, no background polling and inactive-identity initialization only when that identity is opened; whole-process measurements remain a separate acceptance gate.
