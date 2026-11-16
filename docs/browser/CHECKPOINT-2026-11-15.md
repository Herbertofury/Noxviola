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

### First runtime repairs and rejected Windows candidate

Source [`5403076440f13cc11458e83f3ce72194d1b6e930`](https://github.com/Herbertofury/Noxviola/commit/5403076440f13cc11458e83f3ce72194d1b6e930) passed **134 portable contracts, zero failures/skips and 38 syntax checks** locally and in both hosted platforms of [contract run 43767668014](https://github.com/Herbertofury/Noxviola/actions/runs/43767668014). This included 17 extension-readiness/cleanup tests and five path-spelling contracts. [Native run 43767668070](https://github.com/Herbertofury/Noxviola/actions/runs/43767668070) then exposed the limits of those contracts; both overall native gates failed.

The Windows candidate applied an extended-length spelling to the **same** selected `sessionData` directory. Native physical-root equality passed, but the candidate is **rejected and replaced**: the first personal-identity IndexedDB open failed with `UnknownError: Internal error opening backing store for indexedDB.open.` The native LevelDB diagnostic shows a namespaced path ending in `indexeddb.leveldb/LOCK`. LevelDB constructs that suffix with a forward slash, which extended-length Win32 paths do not normalize. Four preceding checks passed; this is a new regression, not a successful repair. Artifact `14182673225`, SHA-256 `497a5afe767c50aa4700360a91b87bce9926604c7bacd7c8fa0979c6512700ca`.

The underlying long-cache-path diagnosis remains supported: the pinned executable lacks `longPathAware`, and the second-identity cache index would reach 271 characters from a 140-character partition root. Cache deletion can require an even longer filename. Chromium maps a generic disk-cache entry-creation failure to the observed `kErrorExists`; that text did not prove a duplicate entry. Relevant sources are [Windows path semantics](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation), [pinned Chromium cache path construction](https://github.com/chromium/chromium/blob/152.0.7977.169/content/browser/cache_storage/cache_storage_manager.cc), [cache entry failure mapping](https://github.com/chromium/chromium/blob/152.0.7977.169/content/browser/cache_storage/cache_storage_cache.cc), and the [pinned LevelDB filename implementation](https://github.com/google/leveldb/blob/7ee830d02b623e8ffe0b95d59a74db1e58da04c5/db/filename.cc). Source plausibility did not substitute for the failing native result.

Persistent MV2 loading now has a separate native lifecycle owner that observes the existing background context before calling the native loader and waits for its committed document to finish loading. Registration and `extension-ready` are not treated as proof that background scripts have run. The helper does not create a hidden replacement host, execute background code, retry messages or add a fixed delay. It leaves lazy background pages, MV3 workers and content-only extensions on their existing paths. A load failure remains visible and the manager must unload the failed runtime; failed cleanup remains explicitly possibly running. This readiness boundary covers document startup, not arbitrary asynchronous initialization or full package compatibility.

Linux now passed the actual persistent MV2 one-shot message, background destruction on disable and restoration on re-enable. Ten native checks passed before the next library check failed immediately with `An object could not be cloned.` The fixture's subscription expression returned its unsubscribe function across Electron's structured-clone boundary. The following repair discards that expression result with `void` while retaining the subscription and every library assertion. No library mutation had been reached and phase two remained unexecuted. Artifact `14183300884`, 786,818 bytes, SHA-256 `119a27ef872f633647d6352cdf525a9861be8d1ab79789e0a731757486399fd6`.

### Conditional Windows storage aliases

The replacement keeps `sessionData` and each identity's original `Partitions/noxviola-identity-…` physical directory unchanged. A shared resolver retains Electron's original `fromPartition` path where its ordinary and canonical Windows paths fit the pinned cache lifecycle budget. Longer paths use a compact, verified junction under the same session-data root and pass its ordinary spelling to `Session.fromPath`. The 22-character base64url alias contains the first 128 bits of the normalized identity's SHA-256. Existing aliases are validated before any target creation; a missing target, foreign entry, mismatched link, collision, denied junction creation or insufficient remaining path budget fails visibly. No existing data is copied, moved, overwritten, retargeted or silently replaced.

Both the application and native driver use the same resolver, preventing a second BrowserContext from opening the same files through a different Session factory. The lifecycle budget includes the pinned cache deletion filename, not only its initial index. Non-Windows identities keep their original partition behavior. No OS setting, executable manifest, permission grant, sandbox option, cache-disable switch or shorter test profile is introduced.

The replacement passes **156 portable contracts, zero failures/skips and 38 syntax checks** locally. Its 27 focused path contracts use real disposable directories/links and a synthetic Electron Session boundary. An independent preservation review found no remaining blocker in the scoped implementation. Expected storage refusals are also caught in restored-tab and ordinary/extension navigation event handlers; they preserve restored tab metadata and report the error without selecting another Session or scheduling a checkpoint write from the catch handler.

Portable filesystem contracts and fresh-profile native restart address specific preservation boundaries. They do not by themselves qualify an upgrade from every existing Chromium profile, remote filesystem, redirected profile or arbitrary path length. Actual Windows junction creation, all five storage APIs and process restart remain subject to the next hosted run. Historical failed receipts above remain failed even if a later source passes.

### First complete native session on both platforms

Published source [`d98cdd5502412ebec4e0867c6bce0a4338858480`](https://github.com/Herbertofury/Noxviola/commit/d98cdd5502412ebec4e0867c6bce0a4338858480) passed all **156 contracts and 38 syntax checks on Windows and Linux** in [run 43769036788](https://github.com/Herbertofury/Noxviola/actions/runs/43769036788). In [native run 43769036713](https://github.com/Herbertofury/Noxviola/actions/runs/43769036713), **all 12 first-process checks passed on both platforms**. They include native isolated storage, geolocation denial, navigation, tabs/split, DownloadItem controls, MV3 content-script storage/lifecycle, persistent MV2 messaging/lifecycle and actual library edit/archive/export/preview/cancel/import operations.

Windows used 99-character ordinary alias paths for both identities, with matching nonzero device/inode identifiers against their original physical directories. The actual second-identity cache entry and index existed at physical path lengths of 268 and 274 characters, while their configured alias inputs measured 224 and 230. This verifies real storage through the compact paths without moving the original data directory. Linux retained `fromPartition`. Windows artifact `14183023096`, SHA-256 `a9f5406172bce5d1f7b82186b6dcf42d250fb34219dbadfd1422aece0a314f32`; Linux artifact `14183352057`, 1,358,908 bytes, SHA-256 `f32672397e96fae29bacb3bc9e0198d0c7cc4fa8059703c6997f40371bb14af6`.

Both overall runs still **failed** in phase two. Complete ordered tab/profile/active-ID restoration assertions passed before the personal cookie assertion found an empty HTTP cookie echo. The fixture had omitted both `Max-Age` and `Expires`, making this a session-only cookie; retaining it after browser exit was an invalid persistence expectation. The following fixture correction explicitly gives the persistent cookie a lifetime and also retains a separate session-only cookie, requiring the former to survive and the latter to expire. Native cookie metadata is checked as well. This does not change production cookie policy, add a flush solely for the test, skip the cookie check or turn the historical run into a pass. See [documented cookie lifetime semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Visual inspection also found that the extension captures still displayed the preview: direct test IPC had bypassed the renderer's normal Install handler. The next fixture revision drives the actual selected-identity controls, consent and Install button, and requires the preview to close and installed rows to appear before capturing status. A separate generated-profile process will seed the five site stores through the original `fromPartition` factory before production opens them, addressing the specific factory-transition gap. That is a same-engine storage transition test, not qualification of every historical engine/profile version.

The corrected fixture source passes **156 portable contracts, zero failures/skips and 39 syntax checks**. The seed is included in the recursive input manifest and goes through the same fixed-entry launcher, ownership checks, timeout and failure retention as the production phases. Its receipt must show normal window close/quit and process exit zero before production starts. Read-only review verified that production reads the seed's values before overwriting them, binds its fixture/source identity and physical directory, and waits for real renderer installation rather than hiding the preview. The next hosted result remains the native acceptance authority.

### Complete generated-fixture workflow passes on Windows and Linux

Source [`ac3a92f628519ae14f04a0499a665af8a7d89110`](https://github.com/Herbertofury/Noxviola/commit/ac3a92f628519ae14f04a0499a665af8a7d89110), tree `a5a32f4bdddc133d9d45aebbd1a1faa6b98e5ac9`, passed [contracts 43769631902](https://github.com/Herbertofury/Noxviola/actions/runs/43769631902) and [native run 43769631926](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) on **both platforms**. Hosted contracts report **156 passed, zero failures/skips and 39 syntax checks**. Downloaded native artifacts were checked against GitHub's SHA-256 values and their actual receipts, not merely the green job summaries.

| Platform | Legacy seed | First production process | Restart process | Verified native artifact |
| --- | --- | --- | --- | --- |
| Linux | 3/3 checks; normal close/quit | 13/13 checks | 6/6 checks | `14183636721`, 1,585,982 bytes; SHA-256 `da0d293bcb6eefe445933322a678760549f4e34e811caf61f97f86593277495f` |
| Windows | 3/3 checks; normal close/quit | 13/13 checks | 6/6 checks | `14183463943`, 1,379,725 bytes; SHA-256 `db6b6d21435e0eaae686ac0699815d13022be6265eb5d91a149b0d4f1b797182` |

All three processes exited cleanly on each platform. Production read all five `legacy-personal` stores before overwriting them, and retained the seed's physical directory identity. Windows actually exercised **`fromPartition` → `fromPath`**; Linux retained `fromPartition`. Both identities then passed persistent-cookie restoration with session-only cookies absent, localStorage/IndexedDB/CacheStorage/service-worker restart, ordered duplicate-preserving tabs and profiles, extension identity/storage/background restart, library metadata restart, and uninstall stopping future injection while removing the background runtime. The seed is a same-engine factory-transition proof, not a test of every historical engine version or owner profile.

The Windows UUID cache files again existed at physical lengths of 268/274 characters, with ordinary configured inputs of 224/230 characters. Actual installed-extension captures at 700×600 and 1320×860 show real installed cards after the renderer consent/Install flow; desktop captures show both fixture packages and their loaded identity rows. Visual inspection found no obvious overlap or clipping in those captured states. The Windows host was Windows Server 2025 build 26100, not the owner's installed Windows 11 environment. Linux retains DBus/font-environment and MV2 deprecation warnings; absent Linux renderer sandbox metrics remain explicitly absent rather than inferred.

**Byte provenance:** both receipts report clean `ac3a92f6` checkouts and unchanged input manifests across execution. Linux's 31 inputs match Git blob bytes exactly, manifest `938a68b3ca4616fdd045301c92a816cf8745b44277408b285c5c75b117eb1d75`. Windows's manifest is `6757eb993a1a980a90eaf3e189bc9a3502185eaf05b8d693da2703ac0fa75610`: its 30 text inputs match deterministic LF→CRLF checkout conversion, while the PNG matches exactly. That historical Windows run is not called byte-identical to the LF package source. A scoped `.gitattributes` now pins all native text inputs to LF and leaves artwork unconverted; the final checkpoint reruns native acceptance to establish identical source bytes across platform checkouts. No repository-wide renormalization is performed.

The versioned capability ledger records this scoped success alongside earlier failures. No full product gate, full capability contract or extension-ecosystem certification is promoted. Real Internet/account workflows, OS picker/media/capture behavior, broader security/accessibility, complete extension API/marketplace support, privacy traffic and equivalent-workload performance remain open.

### Durable checkpoint channels

GitHub remains the canonical source/history channel and the actual live Wiki is the required continuity surface. A Google Drive checkpoint lookup was attempted through the connected Drive search tool, which returned `Unknown tool (google_drive.search)`. No secondary Drive copy or complete multi-remote synchronization is claimed. The next authorized recovery is to restore the Drive connector and copy the final source/evidence export with digest readback; local artifacts and GitHub CI retention are not substitutes for that unavailable channel.

## Remaining acceptance

All full product gates G001–G012 remain open. Priorities beyond the passing hosted fixtures are owner-device execution; native file-picker, media, capture, focus, accessibility and real Internet/account behavior; broader identity/storage and hostile-input isolation; actual third-party extension packages and reviewed updates; a complete installed Windows browser audit; controlled network privacy evidence; and equivalent-workload whole-process performance measurements.

The inspected maintained extension adapter remains unbundled because its permission removal, host admission and sender authentication need repair. Its audit defines concrete next integration work. A loaded extension, working popup, static API name or synthetic adapter is not a universal-compatibility result.

No superiority, zero-network-traffic or production-security claim follows from this checkpoint. First-party telemetry remains prohibited; a full network audit is still required. Existing failed and blocked evidence remains part of the continuation state.

## Continued implementation after `d2c347a`

The owner requested completion of the full accepted goal after the published `d2c347a` checkpoint. Development continues on the same draft PR #5. The held PR #4 and separate native candidate PR #6 remain unchanged; the master directive and previous failures remain preserved. This section records the next source milestone before its own native receipts, without retroactively qualifying it from the older run.

### Product and canonical service changes

- Durable history records committed visits by identity, supports explicit recording/retention choices and uses stable page/visit IDs. Durable bookmark trees support folders, editing, moves and protected roots. Workspace/group definitions and tab assignments preserve browsing identities. These services reuse the existing atomic/checkpoint primitives, retain unknown metadata and reject stale writers.
- The product exposes history, bookmark folders/bar, workspaces/groups, pin/mute and tab placement. Unsaved bookmark and history drafts retain the identity where editing began. Drag handlers resolve current workspace membership, and native application/tab menus share close admission/draining with trusted renderer commands.
- Preferences add independent themes, accents, density, toolbar buttons, home/custom search, individual shortcuts and reviewed presets. Find direction/count, origin-specific bounded zoom, printing, PDF/visible screenshot export, fullscreen and developer tools invoke actual browser actions. Presets exclude browsing/identity/account/extension-grant data.
- The explicit resource monitor reports actual native processes, shared owners and missing values without a polling timer. A first observation has no CPU interval; no comparative performance conclusion is drawn.

### Authenticated extension host

The maintained `electron-chrome-extensions` preload architecture was adapted with a Noxviola-owned authenticated router and canonical services. Mozilla's byte-preserved `webextension-polyfill` 0.12.0 supplies Promise and asynchronous message semantics. Both upstream licenses/provenance are included in the production allowlist.

Actual native frame/worker origin and exact Session identify the principal; request payloads cannot choose an extension or browsing identity. Enrollment epochs revoke in-flight replies/subscriptions/actions/menus even when native unloading fails. The host implements scoped tabs, windows, cookies, bookmark/history, menu and action behavior while rejecting unsupported members and options. Stable browser tab IDs are translated at the native messaging/script boundary without awakening lazy tabs just to query them. Supported event registration is authenticated before it returns. Admitted asynchronous calls participate in normal browser close.

The new generated MV2 fixture checks real callback/Promise calls, first tab-event delivery, native sender/target ID translation, canonical tab/bookmark/cookie mutations, foreign-identity/host denial, callback errors, Promise rejection, actual action badge/title/color and cleanup. Its driver uses real consent, two identities, disable/re-enable, restart and uninstall. This is a reusable regression fixture, not a third-party extension corpus or evidence for every MV2/MV3 member.

### Actual packaged-executable gate

The hosted workflow now builds and verifies the complete application archive, copies the byte-identical package outside the source checkout, then starts the actual executable with its ordinary production entry. Chromium's ephemeral loopback CDP is the external renderer driver; no main-process inspection, alternate production entry, hidden testing IPC or sandbox-disabling switch is added. The product itself reports `app.isPackaged`, and executable/ASAR digests are recorded before and after execution.

Two normal launches exercise the actual UI/preload, sixteen tabs, five stores in two identities, Library metadata, history, nested bookmarks, workspace/group assignments, pin/mute, customization, live page geometry and restart. Two explicitly declared HTTPS documents add bounded Internet browsing. Default Chromium NetLog, selected header/body-free CDP network events, screenshots and native process samples are retained. Package archive extraction is read back against every file digest and mode. Packaged native file-picker and extension-import/lifecycle qualification remain distinct from the source-app extension fixture.

The integrated portable suite passes **223 contracts, zero failures/skips and 61 JavaScript syntax checks**. Peer review and the targeted identity-draft, drag, extension-event and badge regressions pass for the changed components. The first new Windows/Linux source and packaged receipts are pending publication and execution. Full gates G001–G012 remain open; no new build, universal compatibility, zero-telemetry or superiority acceptance is inferred merely from these implementations.

### First new hosted failures: native preload context and Windows archive paths

Published source [`2dc77c2a482f6a9d1c84335abfe1e873cb08758a`](https://github.com/Herbertofury/Noxviola/commit/2dc77c2a482f6a9d1c84335abfe1e873cb08758a), tree `7840122ae84d5de6a1cb60a8421b78e0f4636ee7`, exactly matched the reviewed local index after remote fetch. It remains on draft PR #5. [Native run 43776366374](https://github.com/Herbertofury/Noxviola/actions/runs/43776366374) exposed two distinct failures; neither platform reached the packaged-executable gate.

| Platform | Observed failure stage | Retained evidence |
| --- | --- | --- |
| Linux, job `133003455422` | Portable contracts/syntax passed. Legacy seed and ten first-process checks passed; the new installed bridge fixture passed callback/Promise queries, then failed because `browser.tabs.create` was absent. | Artifact `14186541628`, 812,815 bytes, SHA-256 `ee9393040304292a78f32eca5be731beeb3aa264499651b3773bd35a004c078f`; downloaded archive digest verified. |
| Windows, job `133003455203` | Failed the real ASAR readback contract before Electron execution: a nested archive member was reported absent. | Complete raw job log, 110,866 bytes, SHA-256 `cb1f13fd8a6ce8c8cdbf5b967619f363f3eb1caab24efa8d30038681a654eadd`. No native receipt exists for this job. |

The Linux receipt's retained extension lifecycle console events identify the cause: `contextBridge API can only be used when contextIsolation is enabled`. Electron's native extension background runs in its existing main-world context, so the unconditional isolated-world installer aborted. The correction uses the maintained adapter's direct installation path for that actual context with closure-private transport. Isolated extension pages retain the contextBridge path, and the native sandbox, committed-origin/Session authentication and enrollment-epoch checks remain unchanged. Additional failure diagnostics record actual namespace descriptors, relevant native preferences and registered preloads; no acceptance operation is skipped or retried into success.

The Windows cause is the pinned ASAR library's use of host separators while descending member paths. Only arguments passed to its extraction API are normalized to the host path rules; manifest names remain `/`-separated and every byte/file/entry check remains enforced. The real ASAR contract must pass on Windows before the native and packaged gates can run.

These repairs require a new hosted receipt. The failed `2dc77c2` run remains failed. Its narrow/desktop settings captures were visually inspected: the new preference controls are visible with the intended responsive column layout. That visual observation does not qualify the blocked extension or package workflows.

The repaired local tree passes **224 portable contracts, zero failures/skips and 61 syntax checks**. An independent focused review found no new global transport/Node exposure in the non-isolated path, confirmed unchanged main-process authentication and verified that the Mozilla block retains its exact recorded SHA-256. The native check is retained unchanged, with additional failure diagnostics. The next hosted run must establish the correction in the actual engine and on Windows ASAR paths.

### Repaired source runtime passes; production dependency staging corrected

Source [`b31e39824c0e7651b9855034990d4df5326e206f`](https://github.com/Herbertofury/Noxviola/commit/b31e39824c0e7651b9855034990d4df5326e206f), tree `6586a167fb1fb0ffe0d99cdec0a383f7d6fb505f`, passes [contract run 43776959498](https://github.com/Herbertofury/Noxviola/actions/runs/43776959498). Both hosted platforms report **224 contracts and 61 syntax checks**. In [native run 43776959473](https://github.com/Herbertofury/Noxviola/actions/runs/43776959473), both actual source applications pass the legacy seed **3/3**, first process **14/14** and restart **7/7**. The extension fixture passes all twelve API subchecks at initial installation, re-enable and restart. This establishes the direct native-background installation repair in the actual engine and Windows archive-member readback on its host platform.

| Platform | Source receipt artifact | Complete hosted log |
| --- | --- | --- |
| Linux, job `133005309701` | `14186867010`, 1,618,251 bytes; SHA-256 `db61f709a1b0257453782057d54628296c64c4a710e0a370854a9e482051f231` | 115,488 bytes; SHA-256 `1577ffe05c685a32478f07843058a9d72126fbcbe693d0c0e4264828946eb975` |
| Windows, job `133005309413` | `14186598504`, 1,393,215 bytes; SHA-256 `d80f953ecbea62d5a8f6488e286f7cf81768392f4c2ae33fc7fb10550e851b7a` | 113,649 bytes; SHA-256 `f04e5ba7542c61218cb2fbdd40d741bc377ef1ac0fd3d046988e56e94e14d246` |

Downloaded artifacts match their published byte counts and SHA-256 digests. Both receipts identify the same clean, unchanged set of **50 native inputs**, manifest `a5c50e6b692e306614dd02e1bd4bcc11888be3404960d42a469edcea822df460`, and Electron 44.11.3 / Chromium 152.0.7977.169 / Node 24.22.2. Actual narrow Windows extension and desktop Linux settings captures were visually inspected; the captured controls remain readable. These are source-process results, not packaged acceptance.

Both overall native jobs still fail at the subsequent packaging stage, before a packaged executable starts: `Unexpected packaged application entry: node_modules/@electron`. Reproduction with the hosted runner's exact npm **10.9.9** shows that `npm ci --omit=dev --ignore-scripts` leaves seven empty top-level scope directories for omitted development packages. The local npm 11.9 staging path does not. The repair removes only empty top-level `@scope` directory shells from the disposable copied production staging tree. It preserves all files, nonempty scopes, ordinary directories and directories inside installed packages; the complete ASAR entry and digest gate remains unchanged.

Fifteen focused package/native-tooling contracts pass, including a regression that asserts all production file bytes and installed-package directories survive. A real npm 10 package build passed the previously failing unexpected-entry check and archive member checks, then refused source binding because concurrent extension development changed an input during that local build. That deliberately rejected local build is not accepted or launched. The isolated staging repair is published separately so the existing source can reach the actual packaged-executable gate while the next extension compatibility work continues.

### First actual packaged-browser results and selected-target correction

Source [`0e8601aee779ba3354abcb4051ae7358b67099d4`](https://github.com/Herbertofury/Noxviola/commit/0e8601aee779ba3354abcb4051ae7358b67099d4), tree `77c9fb4416d297a48dfc34595cef9e98bf726426`, passed **225 contracts and 61 syntax checks** in an isolated exact-tree local check before publication. [Native run 43777321374](https://github.com/Herbertofury/Noxviola/actions/runs/43777321374) now launches the actual packaged executable on **both Windows and Linux**, outside the source checkout and through the unchanged production entry.

Both packaged first processes pass **10/10 checks**: packaged/sandbox identity; bounded blank observation; real document navigation and back/forward; five stores isolated across two identities; sixteen live tabs with duplicate URLs; Library form persistence; committed history and nested bookmark create/edit/move with cross-identity denial; workspace/group forms and pin/mute; independent preference changes with real page viewport geometry; and two public HTTPS documents. RFC 9110 and MDN JavaScript each return a secure HTTP 200 document, render real content and expose neither Node `require` nor the privileged browser bridge. These finite public-page results are not authenticated-account, general Internet compatibility or privacy certification.

The overall jobs still fail at the first packaged restart comparison. The saved expectation contains a loopback duplicate URL/title while the restored tab retains the prior MDN document. The test had asked to return the public-page tab to a URL already open in thirteen other tabs. Its URL-only target lookup incorrectly accepted an already-ready duplicate before the selected target committed that navigation. The correction retains the actual public page's CDP target, waits for **that same target's** committed location and complete fixture document, and requires matching tab ID, URL, title and loading state before capturing expected session metadata. All ordered/duplicate-preserving restart comparisons remain intact. No production persistence policy, document content or workload is changed.

| Retained failed overall gate | Artifact | Bytes | Verified SHA-256 |
| --- | --- | ---: | --- |
| Linux | `14186632662` | 3,640,287 | `151ab8780b1a9c79b76673bffb948d2245a91fed7ad7b7cb913318d86f0e51ae` |
| Windows | `14186133853` | 2,723,855 | `a5730e4d15a938e448a57af36f4c1b0df6c9de8b0e85d5991fc4766a93bfc270` |

Both downloaded archives match their published size/digest. Source and packaged JSON/logs, screenshots and default Chromium NetLogs remain preserved. The Windows failed second-phase NetLog is incomplete JSON and cannot establish complete traffic coverage. A passing first process does not close the still-failing restart gate. The targeted regression verifies selected-target readiness across the old public document, an incomplete replacement and the actual complete replacement, while propagating unrelated inspection errors. The repaired exact tree must pass a fresh hosted runtime result.

The corresponding live-Wiki update was prepared against the existing page without changing its preserved history, but automatic approval review rejected its final public publication because it required explicit authorization for that public audience. The editable draft remains preserved and publication is pending owner approval. No alternate write route was attempted; the live Wiki remains at its earlier verified checkpoint until that approval is provided.

## 2026-11-16 — Native close semantics and extension images

The exact selected-document repair `12d924a317cd7aa62ec816f04339be783b76e559` passed its portable contracts and again reached every packaged first-process workflow on both platforms in [run 43777606408](https://github.com/Herbertofury/Noxviola/actions/runs/43777606408). Both restart comparisons still failed. The earlier duplicate-target observation was a real readiness defect, but correcting it did not resolve the final saved-session mismatch.

The remaining cause is now supported by the pinned Electron source: renderer `window.close()` invokes [`WebContents::CloseContents`](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_web_contents.cc), which destroys the contents after emitting its close notification; [`BrowserWindow::WebContentsDestroyed`](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_browser_window.cc) then calls `CloseImmediately()`. That route bypasses the preventable native window-close path used by this application's final snapshot and writer flush. The packaged driver's claim that DOM close tested ordinary guarded close was incorrect. No evidence supports changing the single-flight session writer or rewriting tab URLs to conceal this failure.

The replacement driver requests the ordinary native window-manager protocol for the exact launched process: `WM_CLOSE` on Windows, or `WM_PROTOCOLS/WM_DELETE_WINDOW` on Linux. A small external Python helper requires one visible top-level window owned by that PID, revalidates it and records the protocol and delivery result. The driver records the complete final renderer state and selected committed document, waits for normal process exit, reads the actual primary session JSON and compares ordered tabs and all relevant saved state **before** starting the second process. No test-only application save, main-process injection, delay-before-close or forced termination counts as success. Fresh native qualification remains required.

Retained failed-run artifacts were independently downloaded and matched their exact metadata:

| Platform | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Linux | `14186593219` | 3,557,117 | `205a92bf76faecb39141a582da54845a5c701641d9e4744f0f066fe7eae6c38e` |
| Windows | `14186962507` | 2,709,011 | `e14fd1721b6951604058669b26f93562df22273554b622e33187ee948176bd88` |

The extension action implementation now reads only the exact accepted, hash-verified package resources for a live runtime enrollment, validates and re-encodes PNGs through the actual engine decoder, and serializes real ImageData pixels. It preserves every supplied image resolution, supports global/per-tab defaults and updates, rejects stale or revoked asynchronous results and displays a visible text fallback on actual decode/resource failure. Reviewed Chromium/Firefox API behavior is persisted per installation: Chromium scalar inputs declare size 16 and reject empty setters; the Firefox profile supports empty/reset inheritance and full-document tab reset. Package format supplies a reviewable suggestion, not publisher verification or extra permission. Native acceptance now verifies six acknowledged toolbar states, including decoded colors and visible pixels; those new checks have not yet passed a hosted run at this checkpoint.

Native captures also exposed stale workspace group counts/removal controls after tab assignment. The renderer now updates those counts, pin/mute labels and current-state actions without replacing focused selectors or erasing unsaved assignments and workspace/group form fields. A production-DOM regression verifies the observed failure, subsequent toggles and tab removal; packaged acceptance also checks the actual displayed controls before capture.

### Complete packaged close/restart result at `3253be62`

The coherent tree `4851669e65eda89bc55ebc236322ef9b87e6cd17`, published as `3253be620fb8065a59e7be84ee2027e4a6993a19`, passed [247 portable contracts and 63 syntax checks on both platforms](https://github.com/Herbertofury/Noxviola/actions/runs/43778455104). [Native run 43778455094](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094) then passed completely on Windows and Linux:

| Stage, per platform | Result |
| --- | --- |
| Original-factory generated store seed | 3/3 checks |
| First source-app process, including actual six-stage extension-icon pixels | 14/14 checks |
| Source-app process restart | 7/7 checks |
| First ordinary packaged executable, including public RFC/MDN HTTPS and native close/save | 11/11 checks |
| Ordinary packaged restart and second native close/save | 6/6 checks |
| Complete portable archive readback | All 73 Linux / 74 Windows file entries matched their recorded bytes and SHA-256 |

Both source and packaged receipts contain the same **57 raw-Git-matching native inputs**, clean checkouts and unchanged before/after input manifests: `f9a047bc5dbb0ae6194a79daef15ffd514121e5d0e78f83ed82e0a9e2640a117`. All final ordered tabs, duplicate URLs, profiles, preferences, active workspace/tab IDs and native-close session contents matched before the second launch; the five actual stores, nested bookmark IDs, history, workspace/group data and Library metadata survived the recorded restart. The Windows and Linux workspace captures were reviewed and show the corrected nonempty-group count and disabled removal control. This is scoped hosted-run evidence, not the owner's Windows 11 audit.

| Retained artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux native evidence `14186919124` | 4,958,320 | `4331cb4ac3577c01d67a4b048693ceaa383e8d5264561c72be97f68eb6233169` |
| Windows native evidence `14187685382` | 3,946,941 | `affcd8026c28a34c5f43d4249220dd5a946b5c3fcdbfafe3ec4a0a0bfc7b8721` |
| Linux portable artifact `14187187765` | 123,464,533 | `34095752d4d482e3ad2063671181b56ca37d16ced0093df8b9671822ead7ac6d` |
| Windows portable artifact `14186898288` | 158,576,472 | `74593c3136b4281a1db5bfd5c7aa739d3014443e23d27767d0910af9dacdb031` |

The actual distribution files and their separate hashes are recorded in [release status](RELEASES.md). Both downloaded outer artifacts and every inner distribution entry were independently read back. The application manifests differ only in Windows CRLF checkout of `LICENSE` and `THIRD_PARTY_NOTICES.md`; both match the exact verified LF-to-CRLF transformation of the committed files. The next source pins those two packaged text files to LF as well. No byte-identical cross-platform ASAR is claimed for `3253be62`.

### Next source: honest spelling controls, measured private bytes and real-package acceptance

The next implementation adds an explicit local spelling-check preference and native correction suggestions, preserving the previous enabled default. Source investigation disproved the proposed use of that setter as download consent: Electron initializes dictionaries in its Session constructor, and missing Hunspell files can download independently of the enabled preference. The UI therefore discloses that turning checks off does not block downloads; the supported downloader opt-out remains open. A failed partial native update/rollback remains retryable rather than falsely short-circuiting a later disable. Appearance imports cannot alter the separate spelling choice.

The resource service now retains optional Windows private-memory values, preserves reported zero, and leaves missing/invalid values unknown. A total requires valid data from every sampled process. This improves visibility without changing process policy, adding monitoring timers or asserting a memory advantage.

The separate real-extension workflow admits the unchanged, hash-pinned Dark Reader 4.9.135 Chrome MV2 ZIP, supplies only its native picker choice, and drives actual production review/install/toolbar controls plus the package's own popup/settings handlers. It observes a deterministic light page, native pixels, background failures and ordinary public package traffic. The final receipt must retain every required workflow and all observer failures; no API shim or request replacement exists in the test. Actual third-party execution remains pending for this new source; a successful generated fixture is not a Dark Reader compatibility result. Full gates G001–G012, owner-device inspection, marketplace trust, remaining APIs, complete privacy and equivalent-workload performance remain open.

### Preserved first failures at `ae00b562` and isolated harness repair

The exact source `ae00b562167e3693db0c93c56b40da5f3c396ba1` passed [265 portable contracts and 70 syntax checks](https://github.com/Herbertofury/Noxviola/actions/runs/43779608664). Both [native jobs in run 43779608696](https://github.com/Herbertofury/Noxviola/actions/runs/43779608696) stopped at the new spelling form assertion, before packaging. The settings form saves every displayed default accelerator explicitly; the test incorrectly compared that representation with the original empty override object. Non-shortcut preferences did not change. The repaired assertion compares every unrelated preference and the complete effective shortcut entries exactly, independently resolves saved overrides through the real platform-specific product rules, and preserves unknown shortcut metadata exactly. New regressions reject disabled/rebound shortcuts, stale projections, metadata changes and scalar/toolbar changes. Raw before/after representations remain in the native receipt. No production settings behavior is changed by this repair.

Both [real-extension jobs in run 43779608644](https://github.com/Herbertofury/Noxviola/actions/runs/43779608644) reached the original 180-second deadline before production startup or Dark Reader execution. The driver used `require.main === module`, but [pinned Electron 44.11.3's CLI loader](https://github.com/electron/electron/blob/v44.11.3/default_app/main.ts) dynamically imports its entry file. The repaired guard binds startup to the Electron browser process and the exact explicit driver path; an early startup rejection exits unsuccessfully instead of waiting for the outer deadline. A plain-Node dynamic-import regression executes the actual driver entry with only the engine bootstrap boundary substituted. The timeout is unchanged, the third-party archive is unchanged, and no product API has been added or claimed successful based on this startup failure.

| Original failed artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows native `14187876012` | 746,114 | `069bea7b7a3640c1aab4f2e301623c24964a7532ae46905daf6cd7a07bb2fe76` |
| Linux native `14187399107` | 817,649 | `49c1097dfa8f973cdfa7f15c5cf78356511676dfa23ad20d3fa0d1aaaa94ddc0` |
| Windows real-extension `14188185863` | 7,731 | `6142d0e888940f6fda61f942217c4da4f7f19992bf439ea868233931d5b93519` |
| Linux real-extension `14188365205` | 7,978 | `203bed09c0178c1a7c07f6b2e535ec2c01ef8a9642c2dab8045f77828764994f` |

These original failure archives were downloaded, hash-verified and retained. The repaired source must run the actual native and real-package gates again; `3253be62` remains the last fully passed packaged checkpoint until those new native results exist. The master goal and all twelve gates remain open.

### Core passes at `0c25987e`; real-package panel ordering remains a failed first attempt

Commit `0c25987e7e14cdc78790d8a9423962346b8fa3a9`, tree `532d4e6f3b0b5439a0aeec60bc2a6645ca623883`, passed 269 portable contracts and 71 syntax checks in its isolated source snapshot. [Core native run 43780308365](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365) completed successfully on both Windows job `133015750217` and Linux job `133015750474`: actual source launch/restart, the spelling settings checks, ordinary packaged executable/restart, public HTTPS and complete archive verification all passed. The source spelling-control result now exists; the independent dictionary-download consent limitation is unchanged. Final independent artifact readback is recorded separately.

The dedicated [real-extension run 43780308399](https://github.com/Herbertofury/Noxviola/actions/runs/43780308399) remains a failure on both platforms. The real light-page/sandbox baseline passed, but clicking Extensions returned before its asynchronous IPC state update rendered the panel. The driver then tried to click the hidden import control. No package was installed or executed. Both receipts preserve an empty installed-extension list and the later visible Extensions state. The next test-only repair observes the actual visible/enabled control before invoking its existing click handler exactly once; ambiguity and revalidation still fail, the original bounded observer/deadline remains, and no production code or extension bytes are changed. A delayed-panel regression uses the actual production HTML and renderer with only IPC/layout substituted.

| Original failed real-package artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux `14188047253` | 70,487 | `73ff0145049c36c7db44b9ca93bca4f979b42318d759977e098dbd973fdb62d9` |
| Windows `14188057235` | 59,850 | `408434603dec46321f75113b0286ea955aa8c6b62f3a037d010ff55887bcd9893` |

Both failure archives and raw native receipts were hash-verified and retained. Their unchanged source-input manifest is `ec70c941e041d93892c893ed1c6ca806803abbb176aa56869fef26efb0ba94cd`. This failure provides no evidence about an extension API dependency. The next run must perform the original unchanged-package workflow; universal compatibility and all master gates remain open.

### First unchanged-package dependency at `f76e79d9`

The readiness repair was published as `f76e79d96790d104573cb55cd0b666467da9f4b7`, tree `26b4ac2dadf4513a0f8684afe151d27c5b9ca2d6`, with 270 portable contracts and 71 syntax checks passing in the isolated snapshot. [Real-extension run 43780643491](https://github.com/Herbertofury/Noxviola/actions/runs/43780643491) completed unsuccessfully on both platforms; the original artifacts and raw receipts were retained before continuing.

Windows job `133016813343` passed the light-page baseline, exact reviewed installation and committed persistent background-document checks, but the page stayed light. The retained native console/CDP error identifies the real package's `background/index.js:6356`: `chrome.permissions` is absent when initialization reads `onRemoved`. The background document existing is not successful extension initialization. Its earlier alarms setup did not throw, so this evidence does not justify replacing alarms. The source-directory observer classification also missed the expanded Windows profile path and consequently surfaced the startup error as a later page-darkening timeout; both the raw startup error and timeout remain preserved. The unchanged accepted package digest was `bf953c7dbe3dce677017c56d84969f51027a777189408ac19969bac9e0126b50`.

Linux job `133016813591` stopped at the first native baseline capture with `UnknownVizError`, before installing any package; a later diagnostic capture succeeded. That compositor/readiness failure remains separate from the Windows extension dependency. It cannot be counted as a pass or repaired by suppressing pixel verification.

| Original failed real-package artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows `14188326832` | 71,489 | `63066ebcde02c337c5b93a97f1509d28967159a4000dee7921410488ea981f58` |
| Linux `14187868766` | 45,115 | `4798a9b2ffbd8bfdd37048e69aeec846d094348798ccfe02a18d6afd2860ce63` |

The dependency-ready next extension task is genuine permission-query semantics tied to accepted grants and current native enrollment, including real host-pattern coverage and optional-grant boundaries. No no-op event or assumed successful request/removal may substitute for missing permission behavior. This work is independent of the following core workflow additions and is not included in their source checkpoint until implemented and verified.

### Next core source: durable transfers and real page-tool acceptance

The canonical DownloadManager now persists complete transfer history through the existing ServiceStore/storage primitives. It preserves unknown metadata, original recovery bytes and native callback identity; failed saves keep live controls available and pending state visible. Remove and identity-scoped Clear commit only metadata and never touch downloaded files. Restored unfinished records expose their previous state as interrupted without a fake native item, finish time, resume or automatic URL request. Close waits for actual native terminal cancellation before flushing; history failure offers explicit keep-open/retry/recovery or exit without saving recent transfer metadata. Byte progress does not repeatedly write or clone hidden history. The 20 download contracts and 18 production-DOM contracts passed, including asynchronous cancellation, delayed responses, storage failure/recovery, foreign-identity retention and complete 1,250-record history. Whole-history I/O and visible-list cost remain unmeasured; no performance advantage is claimed.

The expanded source-app gate completes one actual transfer in each identity Session, retains the full downloaded bytes, compares the raw saved history before/after normal restart, verifies actual restored cards and uses the real identity-bound Clear control to preserve the other identity's records and both files. The app-wide list is explicitly identity-tagged, not confidential between identities. No test-only history flush supplies the result.

The same source gate now invokes real Find/Next/Previous/Escape controls with native match results, visible counters and selection clearing; actual zoom menu handlers with viewport/identity/origin/restart readback; the real PDF Tools control; and the visible-page PNG menu handler. It retains output files and hashes, checks decoded PNG dimensions/pixels, and verifies that Cancel preserves an existing destination exactly. Optional PDF readers report missing tools honestly, leaving content/visual readback pending for independent follow-up. The gate does not qualify physical OS menu/picker interaction, hardware printing, arbitrary page fidelity or packaged page-tool exports.

These new production and acceptance changes require their own hosted source/package run. The completed `0c25987e` receipt does not automatically qualify the changed download lifecycle or new page-tool coverage. All original full capability procedures and all master gates remain open.

### `f47a4a38` preserves native download success and exposes a real Find defect

The new core implementation was published as `f47a4a389a17af35bc0708c37e64775c9e71207a`, tree `1b817a98bc72e07d60e2ebbb39153bae5bcd5cb2`. [Native run 43780987710](https://github.com/Herbertofury/Noxviola/actions/runs/43780987710) passed 289 portable contracts and 73 syntax checks on both platforms. Each source process then passed its first 15 checks, including actual completed downloads in two identity Sessions, exact 94,208-byte generated files, three saved terminal history records and real history cards. Both source processes failed at the next Find check, before normal restart, PDF/PNG, zoom restart or packaging. No unexecuted later stage is promoted.

The original Windows and Linux receipts both contain an empty native `found-in-page` event list after typing the initial query. Pinned [Electron 44.11.3's Find implementation](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_web_contents.cc) maps its counterintuitively named `findNext` property directly to Chromium's `new_session`. The [pinned API contract](https://github.com/electron/electron/blob/v44.11.3/docs/api/web-contents.md#contentsfindinpagetext-options) requires true for a new search and false for a follow-up. The browser had passed false for initial text and true for Next/Previous. The causal production repair inverts that translation while retaining the existing browser command meaning. The native test still requires three matches, ordinal sequence 1 → 2 → 1, actual selection geometry, rendered counters and removal of highlighting; no assertion or timeout is relaxed.

| Original failed native artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux `14187847993` | 2,409,375 | `4f538e26063e7e0cdd4b6b7fc931f8427c980de1b3f11a0a6bdd903bb99241cb` |
| Windows `14187978748` | 2,204,288 | `d11482db18ba9072b6a60b3611339650b103c4cd5f23c93f2b6bd64955708e2d` |

Both archives were independently downloaded, hash-verified and extracted, preserving the original receipts and full logs. Native download restart/identity clearing and the new Find correction require the next exact hosted run. The last completely passed source/package checkpoint remains `0c25987e`.

### `ff5432c2`: Find repaired; source download and page-tool workflows pass

The two-file causal Find repair is commit `ff5432c22452fb6cbc78e926f696dc8a31ac1c8a`, tree `b3d11cdfe2f319d7b993111b6c1e456eefa7c176`. Its isolated snapshot passed 289 portable contracts and 73 syntax checks. [Native run 43781469795](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795) completed successfully on Linux job `133019398105` and Windows job `133019398254`, including the actual source process/restart, package build, ordinary packaged executable/restart and full archive gates. The unchanged source assertions now receive three Find matches and ordinal traversal 1 → 2 → 1, then verify the visible counter, native selection geometry and removal of highlighting. The successful source first-process/restart counts are 18 and 10 per platform.

The actual completed files and download history survived normal restart. The actual identity-bound Clear control removed only that identity's saved metadata, retaining the other identity's history and both downloaded files. Actual page-tool checks now reached PDF export, visible-page PNG export, declined replacement, zoom isolation and zoom restoration. Their evidence remains scoped to the source-runtime fixture; passing packaged browsing/restart does not independently qualify packaged page-tool exports or physical OS picker/menu operation.

Independent Poppler text, page-structure and raster readback verified both retained PDFs: one Letter page, the complete fixture heading and generated-data notice, and two clickable local fixture links. Both rendered pages were visually inspected without clipping, missing glyphs or overlapping content. Linux's actual PDF is 19,483 bytes, SHA-256 `36ca33b8e3e82d3421e3b9d52a562e9e98822808fd5a204f4f83852ae0417903`; Windows's is 41,205 bytes, SHA-256 `26eb6355ac236155dd0947d2440c4be487cbbd0a53f4db56c381ac8edc6accb2`. This closes the recorded missing-CI-reader gap for these two files, without claiming arbitrary-site pagination, accessibility tagging or hardware printing.

| Passed native artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux `14188049470` | 4,972,613 | `6bcb20b31d4e2dd85f99bd15ba718ced65948fe86ed9b63f6b6232f0911d59cf` |
| Windows `14188572863` | 4,061,455 | `de209ba586479fc458006c0d1cab9be8dce8e087a21818eaad5f069cdc83db18` |
| Linux portable `14188672341` | 123,484,848 | `a8595fd9924c0cf43ab4e14af95e129033d001a2521fb7e7e5b16f4abb4d5ab3` |
| Windows portable `14188816517` | 158,595,956 | `e73ba954fd7ddab64f16524ebeb81926fb8798474076648dd72d7f6b93c2b9d1` |

All four outer archives were independently downloaded and checked against these exact sizes and digests. Detailed raw-source and whole-distribution readback is recorded in the release evidence. This core success does not qualify the pending permission implementation or erase any original real-extension failure.

### Next extension source: authenticated permission queries and observable presentation

The canonical extension bridge now answers `permissions.contains` and `permissions.getAll` from the current authenticated enrollment's accepted grants. Required MV2 host strings are returned as origins, optional declarations remain ungranted, content-script hosts remain separate from privileged cookie/tab access, and origin containment checks the complete scheme/host/path pattern. Required explicit grants take precedence; an overlapping but ungranted optional explicit host cannot be satisfied by a scriptable-only grant. Native sender origin, exact Session and enrollment epoch are checked before dispatch and again before reply. Both callback and Mozilla Promise adapters preserve real query results and explicit errors. Optional request/removal still rejects, and unimplemented grant-change events remain absent rather than being fabricated.

Independent review found a regular-expression backtracking path in both literal permission containment and the shared URL matcher. Both now use the same nonbacktracking wildcard automaton, preserving literal candidate punctuation and asterisks. Ordinary-Node regression cases exercise actual `glob`, `matches` and `containsPermissions` at 8, 12, 16 and 64 wildcard segments, including positive and near-miss inputs. The earlier 750 ms timeout is retained as failure evidence; the reviewed repaired cases completed in 169 ms including process startup. No pattern cap, sampled URL, scope reduction or general browser speed claim supplies this result.

The real-package observer now recognizes the physically owned package directory despite Windows short/long path spelling, then binds the accepted native runtime ID to that exact enrollment. A separate native presentation helper observes a full nonempty compositor frame at the expected physical size for the exact visible, loaded document, and removes all observers on completion, navigation, renderer loss, destruction or the existing deadline. It does not retry capture, force repaint, sleep, change security or suppress `UnknownVizError`. Its causal value for the original Linux failure remains unverified until the next actual hosted run.

Readback of the unchanged pinned Dark Reader package confirms its startup event registration is guarded, its only permission query is the optional `contextMenus` callback, and that option defaults off. The package's explicit optional-permission request remains unsupported; no success is inferred from namespace exposure. The next native run must still complete the original eight actual package workflows. Universal compatibility, all G001–G012 gates, dictionary-download consent, equivalent-workload superiority and complete privacy qualification remain open. The public Wiki save is still pending explicit publication approval after automatic review rejected the earlier save; no alternate write route was used. The unavailable Drive route remains unresolved.

### `50431f79`: core passes; two real-package inspection defects remain failed

The permission-query and presentation source was published as `50431f79ff05322e6128b0d7262d22d6f25f19b8`, tree `45f7265afa3b98989d5e62b9ab4cc06eeeb5ebaa`. The exact isolated tree passed 301 portable contracts and 76 syntax checks. [Core run 43782023018](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018) and [contracts run 43782023014](https://github.com/Herbertofury/Noxviola/actions/runs/43782023014) completed successfully on both Windows and Linux. Actual source and ordinary packaged browsing/restart remained successful. Its original four core artifacts were downloaded and checked against exact sizes/hashes, with detailed independent readback tracked separately. The fully independently verified `ff5432c` checkpoint, all 65 raw-Git inputs, all 73 Linux/74 Windows distribution files and all 48 identical ASAR members are now reconciled into the capability ledger and release documentation. All 183 capability IDs, all prior full procedures and historical receipts remain intact; the ledger contains 134 source records, without an inventory cap.

The separate [real-extension run 43782023029](https://github.com/Herbertofury/Noxviola/actions/runs/43782023029) remains failed on both platforms. Both passed the actual visible light-page baseline, with an observed full compositor frame followed by the unchanged native capture. Linux passed reviewed installation, then `backgroundDiagnostics` threw while dereferencing `getLastWebPreferences()` returning null for the Chromium-created background page. Windows installed the reviewed package but failed the subsequent observer ownership assertion: ordinary Node `realpathSync` retained the short `RUNNER~1` spelling while Electron returned the long `runneradmin` spelling. The final lexical relative-path comparison consequently rejected a path whose physical parent identity had already matched. Neither receipt contains an extension exception or observer error before this failed inspection; that absence does not qualify unexecuted darkening, popup or Settings checks.

| Original failed real-package artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux `14188414093` | 55,869 | `0e4ef45ed5990d644ab7d449ec95dc4f0e1f1ab91565003a54eda6081d8ccb64` |
| Windows `14187968884` | 72,344 | `7a09bf34c67bd33dd5d361bd925bcc0297dc091e4cb86ec638366e543a3cc00b` |

Both exact failure archives, original receipts and complete job logs were independently retained. The next three-file repair changes only test inspection: native filesystem canonicalization plus positive physical parent/target identity checks replace the alias-sensitive lexical comparison; a genuinely unavailable background preference record stays null in diagnostics. The strict ordinary-page sandbox assertions, exact native enrollment binding, unchanged package bytes, full functional stages, capture calls and deadlines remain unchanged. Pinned Node/libuv and Electron source citations and focused regressions are in [the real-package gate documentation](../../tests/native/REAL-EXTENSIONS.md). No production capability is added or promoted by these test-only repairs.

Independent `50431f79` core readback is now complete: all four outer artifacts, every extracted native record, all 66 raw-Git input files before/after execution, all 73 Linux/74 Windows inner distribution files and all 48 ASAR members were verified. Both hosted logs confirm 301 passing contracts and 76 syntax checks. Source stages are 3/18/10 and packaged stages 11/6 per platform. The input manifest is `f9a374cc9245251b01c3c04815361ac37178933834112f1a092a32045d33f8f5`; both complete application ASARs have SHA-256 `a7dbb4fae6c3f36b85fd5a58e1f0fefd32061de23c04afe52eb70d30a00d45d8`. The independent report is 138,485 bytes, SHA-256 `e847f07f3dd54daff403376296d7b19bb347603ca45f7e326e32d893aee593bf`. Its exact new PDF files received separate text/link/visual readback and were not qualified by the prior PDFs. The report preserves all source-only, physical-picker, owner-device, privacy/performance and third-party-extension limits.

### `99942809`: core verified; unchanged Dark Reader exposes the native storage dependency

The three-file inspection repair and evidence reconciliation are commit `999428099f5d59d91f7c437ae6eace2cdbe0264a`, tree `f4e8f803698ba2125e8d8a964a675446aa102843`. [Core run 43782744635](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635) and [contracts run 43782744792](https://github.com/Herbertofury/Noxviola/actions/runs/43782744792) passed on Windows and Linux: 302 portable contracts, 76 syntax files, source seed/first process/restart 3/18/10 and ordinary packaged process/restart 11/6. Independent verification checked all four outer archives, every native record, all 66 exact raw-Git inputs, the 73 Linux/74 Windows distribution files and all 48 ASAR members. Source manifest: `43f3a149d6f30cb1b141d10b32b1de307e1233a49a1b70d005c3de1a3887546b`; application manifest: `cd0dc48b474130d4dc6b1fc6cb52976b55d047a5b7db5a6c0a1aa7753357777d`; identical complete ASAR: `c3b80cc90cbd036c661d5269cbb307c28859921c3312b6e6b8922ceacd3448d8`. The independent report is 137,134 bytes, SHA-256 `f6ec978cce64ad5c7f7c418d357ce4720efaee5f2f6a5083973598d90c938b20`.

Both exact new PDFs received separate Poppler text/link inspection and visual render readback. Linux's PDF is 19,483 bytes, SHA-256 `a81b441e8e543747604fb777a5a4aee81db1eb6b3a25f2739f2c3ae66e800eb0`; Windows's is 41,205 bytes, SHA-256 `314d38a4b27f7612573476eea210c2bffc8faf13554cf269caa57cfb2b12b3e0`. Both preserve the full one-page generated fixture and two links, without claiming arbitrary-site pagination, accessibility tagging or physical printing.

| Original core artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux native `14189660084` | 4,976,634 | `3dfe768c40e8f10a82e6bb7074ba6690a0a25ac3df7cfb49c245861499b7a090` |
| Windows native `14189135786` | 4,038,723 | `a453111d7c23f04cd1b88dcaf359414c0cbadc8b87eab68d7749a878f9638048` |
| Linux portable `14189201144` | 123,515,852 | `635fd0019544a3d7b1d70b6fa95231c5b40f12f86f37f9d68d51992b37fbb78b` |
| Windows portable `14188269280` | 158,626,795 | `9b8bdb6b8c1b16820a931331fcb083e4994857b4968405a553bfe527ad433bea` |

The separate [unchanged Dark Reader run 43782744653](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653) remains failed. Both platforms now pass the visible light baseline, reviewed installation and exact committed-background binding. Actual darkening fails during unchanged package startup: `chrome.storage.sync.get(null)` returns the native error `"sync" is not available in this instance of Chrome`; the upstream helper resolves null, and `UserStorage.migrateSiteListsV2` dereferences it at `background/index.js:3488` before its later local fallback. The preload forwards the genuine native lastError. No missing error getter, permission event fabrication, package rewrite or storage alias is justified by these receipts.

| Original failed real-package artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux `14187924966` | 86,633 | `f0d9b3ebbe8ac5b37dafad67723c1372678f84e0bc6983eca2cc173493e7ae09` |
| Windows `14189340184` | 76,091 | `7cc06369409f5811e586bd2974e2d2d4f787c6141aa49d3557fdaccb0ef00594` |

### Next candidate: maintained native sync storage and a genuine generated engine upgrade

The source now pins ordinary npm Electron **45.3.2**, with version-specific diagnostics backed by its [exact extension contract](https://github.com/electron/electron/blob/v45.3.2/docs/api/extensions.md) and [native sync cache](https://github.com/electron/electron/blob/v45.3.2/shell/browser/extensions/api/storage/electron_sync_value_store_cache.cc). This gives sync its own per-extension, per-Session native on-disk area and Chromium quotas; it supplies no cross-device synchronization. Managed storage is empty/read-only without a policy provider. Unknown runtimes remain unknown, and restored diagnostics change only after the existing package digest verification, preserving original registry bytes. No browser storage replacement, package modification or security relaxation is added. The documented 45.3.3 release was unavailable through the ordinary npm registry during acquisition; its DevTools-extension startup-race fix remains an unqualified case, also absent from the preserved 44.11.3 baseline.

The candidate native gate adds actual local/sync separation, two-identity isolation, query/default semantics, exact change-event payloads, atomic per-item quota rejection and read-only persistence comparison after normal restart. These call the existing native API in real committed fixture backgrounds; portable receipt contracts supply no native implementation.

The previous seed used the same engine as its reader and therefore never proved a cross-engine upgrade. The new hosted path provisions the exact official **44.11.3** archive into a fresh marked temporary directory, verifies its pinned bytes and complete extracted tree, and admits its executable only for the original-factory synthetic seed. The pinned **45.3.2** application then reads those generated stores in the same physical partition and performs the ordinary restart workflow. All three actual runtime versions are recorded and checked. This does not establish arbitrary owner-profile, old-extension-data or downgrade compatibility. No local Electron execution is used.

The candidate still requires the complete Windows/Linux source and packaged gates, exact 44→45 generated-store evidence and the original unchanged Dark Reader functional sequence. Historical success cannot qualify the changed engine. All original failures and every G001–G012 gate remain open; the public Wiki publication approval block and unavailable Drive route remain unresolved.
