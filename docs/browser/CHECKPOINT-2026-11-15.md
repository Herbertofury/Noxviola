# Electron continuation checkpoint — 15 November 2026

## Scope and authority

Continue the existing PR #5 branch, `browser/enderloom-baseline-20261115`, under the owner's [master directive](MASTER-GOAL.md). The active implementation remains Electron/Chromium. Preserve the separate native PR #6 checkpoint and held PR #4; neither is merged into this continuation. No mark-ready action, merge or production release is part of this checkpoint.

The master directive is an unchanged 24,837-byte copy, SHA-256 `a0ac0a40064278287d875a142c8a23afcbb27195f6691312cda22ea348fdea03`. Its two original Markdown hard line breaks are intentionally retained. Source whitespace checks exclude only that byte-preserved document; `cmp` verified it against the supplied original.

## Implemented services

- Local unpacked/ZIP/XPI extension inspection, owned preview bytes, explicit permission and identity consent, persistent lifecycle, identity-specific startup, popup/options hosting and failure-aware enable/disable/uninstall. CRX signatures and trusted updates remain open. XPI is an unsigned local import. Uninstall retains Chromium extension data and reports that limitation.
- Origin- and identity-scoped permission decisions, separate camera/microphone rules, document-only grants, prompt cancellation and explicit recovery. Native device/display pickers and extension-origin permission semantics remain open.
- Coalesced session writes outside the main thread, visible save failures, safe close coordination and explicit checkpoint recovery. Duplicate JSON keys, invalid UTF-8, unsupported formats and numbers that cannot round-trip are preserved rather than rewritten.
- Native download destination configuration in the correct synchronous callback, current-run progress and pause/resume/cancel/reveal controls. Terminal and resumable interruptions remain distinct.
- Complete reviewed library import, collision-safe IDs, metadata preservation, edit/archive/export, and guarded drafts. The import contract exercises 10,000 items without a result cap.
- Local new tabs, tools panels, horizontal/vertical tab settings, identity-specific extension UI, downloads, permissions and the searchable capability ledger. Older IPC replies and background events do not erase a newer draft.

The initial capability ledger has **183 behavior records and 100 source records**, with explicit expansion queues. It is not an exhaustive installed-browser audit. No record was promoted to verified merely because its source or tests exist.

## First published source and portable evidence

Published source: [`60127526eea771ff49c97526c58aaef5db1a0aaf`](https://github.com/Herbertofury/Noxviola/commit/60127526eea771ff49c97526c58aaef5db1a0aaf).

Its tree is `22751d733aa1e7747cc570af6e9b8e7fa6fb8f61`, identical to the clean local checkpoint `b2e8a44c1065ea54d7a26cb43ebdd2b0af0646bc`. The authenticated GitHub commit changed commit metadata, not source bytes. The local checkpoint remains on a separate checkpoint branch.

| Gate | Observed result |
| --- | --- |
| Local Node contracts | 106 passed; 0 failed, 0 skipped |
| Source syntax | 33 JavaScript files passed |
| Linux and Windows cross-packaging | Both actual ASARs matched the complete source/dependency allowlist and SHA-256 values |
| Windows portable archive | Every archive entry was read back and matched against its digest |
| Local native execution | Blocked at display preflight, exit 2; runtimeAttempted=false, runtimeStarted=false |
| Hosted Linux contracts | 106 passed; syntax passed |
| Hosted Windows contracts | 103 passed, 3 failed; the failures and corrections are retained below |

The packaged production JavaScript closure contains exactly `yauzl@3.4.0` and `pend@1.2.0`. Development dependencies and private data are excluded. Electron is pinned to **44.11.3**. Packaging, portable tests and DOM execution are separate from native acceptance.

## First hosted failures and corrections

Preserve [contract run 43765672981](https://github.com/Herbertofury/Noxviola/actions/runs/43765672981) and [native run 43765673053](https://github.com/Herbertofury/Noxviola/actions/runs/43765673053).

1. **Download filename portability.** Windows interpreted a backslash as a path separator; the original assertion expected a Linux-only sanitized name. The filename service now removes both Windows and POSIX path components consistently, with traversal assertions for both forms.
2. **Unpacked collision fixture.** A case-insensitive Windows filesystem cannot create the two differently cased entries assumed by the test. The fixture now uses distinct NFC-equivalent filenames, verifies both exist and retains the archive case-collision gate. It does not skip the safety contract.
3. **Durability fault injection.** A Windows temporary-directory alias differed from the manager's canonical path, so the post-rename fault never fired. The test now targets the actual canonical registry path and requires exactly one injected failure. All preservation and no-execution assertions remain.
4. **Native binary setup.** The Linux native job passed contracts and syntax, then stopped before launch because `node_modules/electron/path.txt` did not exist. The pinned npm package has no postinstall hook; the explicit native gate does not invoke its lazy loader. Native CI now requires the pinned official installer and a file-based binary check before the runtime gate.

These are corrections to identified failures, not permission to remove acceptance checks or disable the sandbox. Results from the corrected source must be recorded separately; a workflow definition does not constitute a passing run.

## First actual hosted runtime results

The corrected source [`3a994c23aadaf037efd22763e0947169dffa0c31`](https://github.com/Herbertofury/Noxviola/commit/3a994c23aadaf037efd22763e0947169dffa0c31) passed all **106 portable contracts and 34 source syntax checks on Windows and Linux** in [contract run 43766076423](https://github.com/Herbertofury/Noxviola/actions/runs/43766076423). Explicit Electron provisioning and file verification passed on both native runners.

[Native run 43766076534](https://github.com/Herbertofury/Noxviola/actions/runs/43766076534) then launched the actual source application on both platforms, using Electron **44.11.3**, Chromium **152.0.7977.169**, Node **24.22.2**, a clean source checkout, forced sandboxing and generated loopback fixtures. It **failed**, and its evidence is retained:

| Platform | Actual passing checks before failure | Failure and evidence |
| --- | --- | --- |
| Linux | Renderer Node isolation; actual shell captures at 700×600 and 1320×860; navigation/redirect/history; identity-separated cookies, localStorage, IndexedDB, cache and service workers; geolocation denial; 16 live duplicate tabs, close/reopen and split bounds; real DownloadItem completion/pause/resume/cancel; MV3 content-script storage and identity-specific disable/re-enable. | MV2 background messaging timed out. Artifact `14182750057`, 776,376 bytes, SHA-256 `8eeb7a07997aa8219ac9bf324892d1a1545bce4edf4017bec45c252c5d0741c2`. |
| Windows | Renderer Node isolation and reported sandbox metric; actual shell captures at both sizes; navigation/redirect/history. | The identity-storage workflow rejected with an opaque `[object Object]`. Artifact `14181994122`, SHA-256 `42584b58cf917814695fae629e439c266ebb1909be54ae749ed78515b8b1e8ae`. |

The original harness omitted an existing content-script messaging-error field and did not preserve DOMException fields across the renderer boundary. The next diagnostic checkpoint records exact storage steps, plain error fields and native extension context. It preserves the failing gates rather than skipping them. Neither run reached phase two, library restart acceptance or uninstall acceptance. The Linux receipt does not independently report a renderer `sandboxed` metric; that platform's field remains absent.

The actual Windows narrow settings and desktop blank-page screenshots were inspected: text and controls fit those captured states without visible overlap. This is limited visual evidence, not a complete focus, accessibility, extension-UI or owner-device audit. Raw process metrics are retained as milestone samples, without a comparative performance claim.

Later source and CI outcomes are linked from [PR #5](https://github.com/Herbertofury/Noxviola/pull/5) and the live [Assistant backlog](https://github.com/Herbertofury/Noxviola/wiki/Assistant%E2%80%90Backlog); historical failures above remain part of the record.

### Identity partition alias correction

The pinned [Electron browser-context source](https://github.com/electron/electron/blob/v44.11.3/shell/browser/electron_browser_context.cc) lowercases persistent partition directory names through `MakePartitionName`. Noxviola previously accepted case-distinct saved IDs such as `Work` and `work`, even though they could refer to the same on-disk partition. Session validation now rejects those aliases before fallback, recovery or writes can hide the ambiguity. It also includes legacy inferred identities and the automatically inserted `personal` identity. Unique uppercase IDs retain their original spelling and metadata; no IDs are silently merged, lowercased or reassigned. Six focused regressions exercise candidate saves, primary and previous checkpoint preservation, recovery refusal and unambiguous restart. This source-level isolation defect is distinct from the fresh lowercase Windows fixture failure above.

### Diagnostic source and concrete runtime failures

[`6fccdd2382cd36bcdaefb58a41ef898c35aadb87`](https://github.com/Herbertofury/Noxviola/commit/6fccdd2382cd36bcdaefb58a41ef898c35aadb87) published the alias correction and lossless failure diagnostics. [Contract run 43766771106](https://github.com/Herbertofury/Noxviola/actions/runs/43766771106) passed on both platforms: **112 tests, zero skips, 34 syntax checks**. [Native run 43766771107](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107) failed on both platforms and is retained independently of subsequent fixes.

- Linux again passed the preceding eight workflows. The MV2 content script reported `Could not establish connection. Receiving end does not exist.` The background extension emitted loaded/ready at `22:00:38.764Z`, began native navigation at `.767Z` and finished loading at `.800Z`. Failure inspection found one authorized, registered background page with a complete committed document and an actual `runtime.onMessage` listener, without a recorded background console error, failed load or crash. This supports the cold-start ordering diagnosis; the individual message was not timestamped, so that exact ordering remains an inference. Artifact `14182666487`, 778,545 bytes, SHA-256 `ce4be6e21e7e5566f3b17e74726bb207205a58b858a826c9e2f25c8bab02fe0c`.
- Windows failed specifically in `writeIdentity(second)` → `cacheStorage.write`, with `InvalidAccessError` code 15: `Failed to execute 'put' on 'Cache': Entry already exists.` Personal identity storage and the second identity's empty-store assertions preceded that failure. The native log again reports index-directory creation errors. The second persistent storage path measured 140 characters before deeper cache directories. Path length is a concrete diagnostic lead, not yet a proven fix. Artifact `14182472385`, SHA-256 `6b68b47cf660a5957bf96bc51ee8d4172812a108393418bfaa8169d0c436fded`.

The versioned capability ledger now links these receipts and scoped outcomes for twelve affected capabilities. No full capability status, extension-ecosystem certification or master-goal gate was promoted. Neither run reached phase two.

### Repairs following the diagnostic checkpoint

The Windows repair uses the extended path spelling of the **same** selected `sessionData` directory before Electron readiness. Identity IDs, partition names, profile location and existing files remain unchanged. The original long fixture path is retained. No registry setting, executable manifest, permission grant, cache-disable option or alternate short test root is introduced. Already namespaced paths are idempotent and other platforms are untouched. An ordinary path containing ambiguous trailing dots/spaces is rejected rather than silently changing its filesystem interpretation.

The causal source review found that the pinned Electron executable lacks `longPathAware` and the nested second-identity cache index would reach 271 characters from a 140-character partition root. Chromium maps a generic disk-cache entry-creation failure to the observed `kErrorExists`; that text did not prove a duplicate entry. The path prefix is preserved through Electron's `App::SetPath`, Chromium's PathService/FilePath, storage wrappers and Win32 file calls. Relevant sources: [Windows path semantics](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation), [pinned Electron path override](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_app.cc), [pinned Chromium cache path construction](https://github.com/chromium/chromium/blob/152.0.7977.169/content/browser/cache_storage/cache_storage_manager.cc), and [cache entry failure mapping](https://github.com/chromium/chromium/blob/152.0.7977.169/content/browser/cache_storage/cache_storage_cache.cc). The native gate must still prove successful long-path storage, the same physical root and restart; this is not a claim that every Chromium path API supports arbitrary lengths.

Persistent MV2 loading now has a separate native lifecycle owner that observes the existing background context before calling the native loader and waits for its committed document to finish loading. Registration and `extension-ready` are not treated as proof that background scripts have run. The helper does not create a hidden replacement host, execute background code, retry messages or add a fixed delay. It leaves lazy background pages, MV3 workers and content-only extensions on their existing paths. A load failure remains visible and the manager must unload the failed runtime; failed cleanup remains explicitly possibly running. This readiness boundary covers document startup, not arbitrary asynchronous initialization or full package compatibility.

Local verification of these repairs passed **134 contracts with zero failures/skips and 38 JavaScript syntax checks**. This includes 17 extension-readiness/cleanup tests and five Windows path-preservation contracts. Each repair is subject to a new hosted runtime result. Historical receipts above remain failed even if a later source passes.

### Durable checkpoint channels

GitHub remains the canonical source/history channel and the actual live Wiki is the required continuity surface. A Google Drive checkpoint lookup was attempted through the connected Drive search tool, which returned `Unknown tool (google_drive.search)`. No secondary Drive copy or complete multi-remote synchronization is claimed. The next authorized recovery is to restore the Drive connector and copy the final source/evidence export with digest readback; local artifacts and GitHub CI retention are not substitutes for that unavailable channel.

## Remaining acceptance

All full product gates G001–G012 remain open. Priorities are actual supported-desktop execution and review of its screenshots/logs; native file-picker, media, capture, focus, accessibility and real internet behavior; verified identity/storage isolation; actual third-party extension packages and reviewed updates; a complete installed Windows browser audit; controlled network privacy evidence; and equivalent-workload whole-process performance measurements.

The inspected maintained extension adapter remains unbundled because its permission removal, host admission and sender authentication need repair. Its audit defines concrete next integration work. A loaded extension, working popup, static API name or synthetic adapter is not a universal-compatibility result.

No superiority, zero-network-traffic or production-security claim follows from this checkpoint. First-party telemetry remains prohibited; a full network audit is still required. Existing failed and blocked evidence remains part of the continuation state.
