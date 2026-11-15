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
