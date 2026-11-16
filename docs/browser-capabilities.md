# Browser capability audit and implementation ledger

**Inventory version: 2026-11-16.1. This is an initial documented inventory with scoped source and packaged runtime evidence, not a completed four-browser audit.** The target is the complete applicable union in the [unchanged master goal](browser/MASTER-GOAL.md). There is no feature-count ceiling and no acceptance gate is closed by this inventory. Original research dates and reference-browser release bases remain unchanged.

The latest verified runtime snapshot is [`3253be620fb8065a59e7be84ee2027e4a6993a19`](https://github.com/Herbertofury/Noxviola/commit/3253be620fb8065a59e7be84ee2027e4a6993a19). Its [hosted native run 43778455094](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094) passed the source fixtures and the **actual packaged executables** on Windows and Linux, including normal native close, complete saved-session readback and restart. The [portable gate](https://github.com/Herbertofury/Noxviola/actions/runs/43778455104) passed **247 contracts and 63 syntax checks** on each platform. The exact positive scopes and remaining gaps are recorded below. Neither generated extensions nor two public HTTPS pages establish universal compatibility, privacy or comparative efficiency.

The canonical, searchable data is [browser/capabilities.json](../browser/capabilities.json). Its [Markdown index](browser-capabilities-index.md) is a reading aid; the browser's explicitly opened Capabilities panel reads the same JSON. This update adds **35 scoped receipts** while preserving all **183 capability IDs and statuses**, the original acceptance procedures, **112 source records** and further discovery queues. Counts describe recorded work, not a limit on the goal.

The earlier [ac3a92f6](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) and [d2c347a5](https://github.com/Herbertofury/Noxviola/actions/runs/43770224325) source passes remain source-bound history. The failing [6fccdd2](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107), [5403076](https://github.com/Herbertofury/Noxviola/actions/runs/43767668070) and [d98cdd5](https://github.com/Herbertofury/Noxviola/actions/runs/43769036713) runs retain their outcomes, including the rejected global-namespace candidate, MV2 startup ordering failure and invalid session-cookie expectation. Later failures are preserved as well:

| Published revision | Retained overall result | Causal finding and scope |
| --- | --- | --- |
| [2dc77c2](https://github.com/Herbertofury/Noxviola/actions/runs/43776366374) | Failed; packaged execution not reached | Linux's native background rejected unconditional contextBridge installation. Windows failed ASAR member lookup with host separators before Electron execution. |
| [b31e398](https://github.com/Herbertofury/Noxviola/actions/runs/43776959473) | Source passed; overall packaging stage failed | Both source flows passed 3/14/7 checks. npm 10 left empty top-level dependency scope directories in the disposable production staging tree; no packaged executable started. |
| [0e8601a](https://github.com/Herbertofury/Noxviola/actions/runs/43777321374) | Packaged first process passed 10/10; restart failed | URL-only readiness accepted an already-open duplicate before the selected page committed. The Windows failed second-phase NetLog is incomplete, so complete traffic counts remain unknown. |
| [12d924a](https://github.com/Herbertofury/Noxviola/actions/runs/43777606408) | Packaged first process passed; restart still failed | Correct target readiness exposed the remaining harness defect: renderer window.close() bypassed the preventable native window-close path. The replacement requests the real OS protocol and checks saved data before relaunch. |

Full artifact digests, raw logs and repair history are retained in the ledger and [source checkpoint](browser/CHECKPOINT-2026-11-15.md). Later success does not rewrite any earlier failed gate. New local spelling controls, optional private-memory reporting and the real-extension corpus workflow are **post-3253 implementation changes awaiting their own hosted receipts**.

## What was actually inspected

The research used vendor feature indexes, support documentation, release notes, WebExtension API references and maintained host implementations. Noxviola source was reviewed from PR #5's `362fb016c2239c6a00ef844357f0bb1dccf282b3` baseline through `3253be62` and its explicitly unverified continuation. The verified snapshot used **Electron 44.11.3, Chromium 152.0.7977.169 and Node 24.22.2**. The same engine versions at two revisions do not transfer acceptance automatically; each receipt names its tested source.

**The user's installed Windows 11 browsers were not accessed.** Their executable paths, installed versions, profiles, settings and actual feature availability remain unresolved. Documentation versions must never be presented as installed versions. The current Linux workspace does not establish access to the user's Windows desktop. No private browser profile was copied or inspected for this audit.

| Reference | Documented release basis | Qualification |
| --- | --- | --- |
| Opera GX | [139.0.6053.63, November 12](https://blogs.opera.com/security/2026/11/update-your-browser-security-fix-for-chrome-zero-day-cve-2026-125350/) | GX and Opera One have different release lines. Early Bird options are separate variants. |
| Google Chrome | [157.0.8103.78/.79 for Windows, November 11](https://chromereleases.googleblog.com/2026/11/stable-channel-update-for-desktop_01744469280.html) | The November 12 early-stable 158 announcement does not establish a universal installation or rollout. |
| Mozilla Firefox | [160.0, November 10](https://www.firefox.com/en-US/firefox/160.0/releasenotes/) | Release, ESR, Labs and staged features differ. |
| Microsoft Edge | [157.0.4341.60, November 13](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel) | Account, enterprise policy, platform, market and rollout affect availability. |

Each capability stores behavior, reference variants, known options, dependencies, Noxviola status, code ownership, integration strategy, performance and privacy implications, acceptance procedures, evidence, improvement opportunities and the next action. The configuration lists are explicitly partial. A link to a feature index does not prove every sub-option, default or platform behavior.

The API queues retain **51 namespaces discovered in the MDN index and 84 in Chrome's index**. These are namespace discovery records, not verified API implementations. Member signatures, events, argument behavior, return values, errors, contexts, permission checks, version differences and lifecycle must be expanded separately. The source indexes can grow, and discovery must continue.

## Findings that change implementation decisions

### Similar labels can describe different behaviors

| Capability | Current documented distinction | Consequence for Noxviola |
| --- | --- | --- |
| Containers and profiles | Firefox now documents built-in containers; its companion extension adds workflows such as site assignment. Containers isolate site state, not IP address or the entire device fingerprint. [Mozilla](https://support.mozilla.org/en-US/kb/how-use-firefox-containers) | Keep identity storage isolation, site-assignment rules and network routing as separate capabilities. An Electron partition alone does not establish full container parity. |
| Tab groups and workspaces | Firefox's saved tab groups are local. Edge's current Workspaces differ from the earlier shared/collaborative product. [Firefox](https://support.mozilla.org/en-US/kb/tab-groups), [Edge](https://explore.microsoft.com/en-us/edge/features/workspaces) | Persist local group/workspace identity first; retain synchronization and collaboration as explicit additional contracts. |
| Research collections | Microsoft documents retirement of Collections in Edge 149; export to Favorites cannot preserve every kind of old collection content. [Microsoft](https://support.microsoft.com/en-us/edge/organize-your-ideas-with-collections-in-microsoft-edge) | Preserve rich collection usefulness as a historical variant rather than incorrectly claiming it is a current Edge feature. Migration must account for notes and other non-URL content. |
| Tab suspension | Chrome Memory Saver deactivates eligible tabs and reloads when needed; Edge sleeping tabs suspend activity with different resume behavior. [Chrome](https://support.google.com/chrome/answer/12929150?hl=en-EN), [Edge](https://support.microsoft.com/en-us/edge/learn-about-performance-features-in-microsoft-edge?form=M401RJ) | Destroying a WebContents is not a verified implementation of sleeping tabs. Preserve forms, media exceptions, state and responsiveness in equivalent-work tests. |
| Split browsing | Chrome documents two panes with multiple layouts; GX's four-pane announcement belongs to Early Bird. [Chrome](https://support.google.com/chrome/answer/16971124?hl=en-0), [Opera](https://press.opera.com/2026/10/29/opera-gx-browser-booster/) | Finish resize, focus, active-pane controls and identity routing in the existing two-view implementation; model additional layouts independently. |
| Floating content | Firefox 160's early Mini Window can show a tab or selected region; video Picture-in-Picture is a different feature. [Firefox release notes](https://www.firefox.com/en-US/firefox/160.0/releasenotes/) | Do not call an ordinary video popout complete page/region-window compatibility. |
| Customization | GX exposes independently useful mod elements including visuals, sounds and shaders. [Opera](https://www.opera.com/gx/features/mods) | Keep optional theme/media components independently configurable. Their presence does not justify mandatory animation or background audio. |
| Shortcuts | Firefox's editable shortcut workflow is documented as experimental, with layout-specific limitations. [Mozilla](https://support.mozilla.org/en-US/kb/customize-keyboard-shortcuts-firefox) | Store binding conflicts, keyboard layout, reserved commands and accessibility behavior rather than copying only shortcut labels. |

Proprietary cloud features, shopping, news, AI, VPN/proxy services and media integrations remain target capabilities in the registry. Their accounts, availability, privacy costs and licensing dependencies must be recorded individually. They are not implicitly enabled or authorized merely because another browser advertises them.

### A host's API list is not universal extension compatibility

Electron explicitly targets a subset of Chrome extension behavior. The pinned 44.11.3 source documentation differs from the moving latest website, including storage descriptions. The maintained adapter inspected during this continuation has concrete permission and caller-authentication gaps when used unmodified. Noxviola selectively reuses its MIT transport/menu architecture with native sender/Session/epoch admission, and embeds the actual Mozilla 0.12.0 Promise adapter with its retained license. The [host comparison](browser-capabilities-extension-hosts.md) and [package-level audit and current integration](browser/EXTENSION-ARCHITECTURE.md) distinguish the audited candidate, adopted source, supported subset and remaining native qualification.

Extension variants in the registry describe target compatibility contracts. An associated browser name does not assert that all listed API members or options exist in that browser. Portable Safari JavaScript is distinct from Apple native app components. Successfully extracting XPI or CRX content is distinct from validating its publisher signature.

## Current Noxviola checkpoint

These implementations belong to the Electron PR #5 continuation. The following positive runtime claims are limited to `3253be62` and its retained source/package receipts. Each complete capability stays partial or unverified where its wider contract remains open; available code and a scoped pass do not close missing variants.

| Area | Implemented scope and recorded runtime evidence | Remaining qualification or behavior |
| --- | --- | --- |
| Independent preferences | Validated home/custom search, appearance, toolbar visibility, shortcut conflicts/disable/reset and preset import/export exist in the [service](../browser/preferences.cjs). The actual packaged form applied vertical tabs, light theme, teal accent, compact density and the bookmarks bar; renderer attributes, page geometry and normal restart passed. | Home/custom-search choices, shortcut editing, preset/picker workflows, complete startup modes, mixed appearance combinations, fonts/assets and full native accessibility remain unqualified. |
| History | The [canonical identity-owned service](../browser/history.cjs) records committed HTTP(S) main-frame visits and supports search, deletion, pause/retention and explicit recovery. Packaged committed-title/query behavior, foreign-identity denial and stable page/visit data across restart passed. | Native range/delete/clear/retention/recovery workflows, interchange, complete redirect/title timing and large-history cost. |
| Hierarchical bookmarks | The [canonical tree](../browser/bookmarks.cjs) has stable IDs, protected roots, folders/separators/tags/order and durable edits/moves/deletes. Actual packaged forms created nested folders, edited/moved a bookmark with its ID intact and restored the tree after restart. The source bridge exercised bookmark CRUD and its creation event. | Full tag/reordering UI, HTML/JSON interchange, failure/recovery, large trees and all upstream API semantics. The rich-reference vault remains separate. |
| Workspaces and groups | [Local named/color definitions](../browser/workspaces.cjs), tab membership, collapsed groups and identity-preserving organization are implemented. Packaged forms created and assigned definitions, updated count/removal controls, retained pin/mute and restored stable IDs plus the active workspace. | Complete focus/switching/drag behavior, group bulk/close/reopen, extension tabGroups, sync and collaboration. |
| Browser controls | Canonical pin/reorder and audible/mute state, find controls, origin zoom, native print/PDF and visible-page PNG commands exist in [integration](../browser/main.cjs). Actual pin/mute flags, bridge tab move and ordered metadata restart passed. | Real sound/indicators, find/zoom/print/PDF/image-output quality, actual OS destination dialogs, complete save-page formats and keyboard/accessibility remain unqualified. |
| Resource monitor | The packaged workflow called the actual [resource-sample service](../browser/resources.cjs) at explicit milestones and retained process CPU/working-set observations plus CDP process and renderer measurements. There is no sampling loop or limiter. | Full OS correlation, worker/shared attribution, observation overhead, GPU/disk/network scope and equivalent-workload comparisons. The post-3253 optional Windows private-memory fields remain unverified. |
| Extension host | The generated source fixture passed callback/Promise and native-ID routing, canonical tabs/bookmarks, host/identity cookie admission, foreign denial, revocation, action state and six acknowledged image stages initially, after re-enable and after restart. [Exact subset and provenance](browser/EXTENSION-ARCHITECTURE.md). | The packaged workflow does not install extensions. Real upstream packages, MV3 worker startup/wake, optional grants, full windows/history/menu/action semantics, publisher trust, updates/rollback and universal compatibility remain open. |

### Changes after the verified source

The new local spelling setting preserves the prior enabled default and controls checking/correction suggestions. It is excluded from appearance presets. **It does not block engine dictionary downloads or constitute download consent.** The pinned Session initializes dictionaries before the enabled setter, and a missing Hunspell dictionary can download independently of that preference. A supported downloader opt-out remains unresolved; no dummy URL, network interception or unsupported switch is presented as its solution. See the [privacy boundary and exact upstream sources](browser/PRIVACY.md).

Optional Windows private-memory values and an availability count are also new. Reported zero remains valid, invalid/missing values remain unknown, and a total requires valid values from every sampled process. Units are bytes converted from Electron's binary kilobytes (1,024 bytes); they are not PSS or deduplicated physical memory. The local [resource contracts](../tests/resources.test.cjs) do not constitute a new hosted receipt. The [real-extension corpus workflow](../tests/native/REAL-EXTENSIONS.md) is likewise implementation, not a passing real-package result. None of these changes inherits `3253` runtime acceptance.

### Earlier source-bound foundations

The following retained results belong to the historical fixture revisions documented below. They remain evidence for those exact versions, not automatic acceptance of the current source.

| Area | Source and scoped evidence | Missing acceptance or capability |
| --- | --- | --- |
| Session reliability | Validated private checkpoints, previous-data preservation, explicit recovery and coalesced writes. Normal close/restart restored ordered duplicate tabs, profiles and active selection on both hosted platforms. | Native crash/interrupted-save recovery, shutdown failure, corrupt/future formats and canceled recovery. |
| Favorites vault | Edit, reversible archive, search, export, reviewed JSON import and corruption-preserving storage. Actual library IPC edit/archive/export/preview/cancel/merge and metadata restart passed. | All item types, complete search, native picker interaction, stale import sources and failed-write/recovery UI; current bookmark-tree implementation is separately described above, while media storage and sync remain additional work. |
| Site permissions | Both Electron handlers, separate camera/microphone rules, per-identity/requesting/embedding origin decisions, document grants, durable rules and recovery. A real geolocation request was denied on both platforms. | Native frame/OS allow and revocation behavior, media/notification variants, secure device pickers and already-running capture revocation. |
| Downloads | Identity-tagged progress and close handling. Actual DownloadItem completion/bytes, pause/resume and cancellation passed using supplied synthetic destinations. | Native picker/cancel interaction, interrupted transfers, persistent history, terminal retry and in-progress restart. |
| Extensions | Owned previews, unpacked/ZIP/XPI inspection and identity enrollment. The two generated unpacked fixtures passed actual renderer consent/Install, disable/re-enable, restart and uninstall. | Verified signatures/updates, stored-data erasure, real third-party packages, MV3 workers and full extension API semantics. |
| Capability ledger | One versioned JSON inventory and searchable panel. | Installed-browser audit, all settings/member expansion and final union coverage. |

## Verified source and packaged checkpoint at 3253be62

The [native run](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094) used clean checkouts of tree `4851669e65eda89bc55ebc236322ef9b87e6cd17`. Both platforms passed these separately recorded stages:

| Stage, per hosted platform | Result | Boundary |
| --- | --- | --- |
| Original-factory generated store seed | 3/3 | Same engine, original `fromPartition` Personal storage before production readback. |
| First source application process | 14/14 | Generated local sites, real identity stores, permissions/download fixtures and authenticated extension host; includes decoded visible icon pixels. |
| Source application restart | 7/7 | Ordered session, identity stores, Library metadata, extension execution and uninstall behavior. |
| First actual packaged executable | 11/11 | Ordinary ASAR entry, real renderer forms, two public HTTPS documents and native close/save. |
| Packaged executable restart | 6/6 | Ordered tabs/preferences, both identities, Library/history/bookmarks/workspace/group data and a second native close/save. |
| Complete distribution readback | 73 Linux / 74 Windows file entries | Every entry matched its recorded size/digest; unsigned PREVIEW, not a production release. |

For packaged close, the helper selected a unique visible top-level window belonging to the launched PID and sent `WM_CLOSE` on Windows or `WM_PROTOCOLS/WM_DELETE_WINDOW` on Linux. Message delivery alone was not success: the driver required a clean child exit and compared the actual saved session with the complete final state before starting another process. Ordered duplicate tabs, profiles, preferences and active workspace/tab IDs were retained. No application save backdoor, artificial flush or forced termination counted as a pass.

Both source and packaged receipts list **57 inputs matching raw Git bytes exactly**, a clean checkout and unchanged before/after manifest `f9a047bc5dbb0ae6194a79daef15ffd514121e5d0e78f83ed82e0a9e2640a117`. This source-input parity is distinct from complete platform packaging. The application manifests differ in `LICENSE` and `THIRD_PARTY_NOTICES.md`: Windows matches the verified LF-to-CRLF conversion, and the other 47 application entries match. No byte-identical cross-platform ASAR is claimed; the next source pins those two notice files to LF.

| Native evidence artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux 14186919124](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094/artifacts/14186919124) | 4,958,320 | `4331cb4ac3577c01d67a4b048693ceaa383e8d5264561c72be97f68eb6233169` |
| [Windows 14187685382](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094/artifacts/14187685382) | 3,946,941 | `affcd8026c28a34c5f43d4249220dd5a946b5c3fcdbfafe3ec4a0a0bfc7b8721` |

The complete portable archives and separate outer-artifact/distribution hashes are recorded in the JSON and [release status](browser/RELEASES.md). The Windows runner is hosted Windows Server 2025, not the owner's Windows 11 desktop; Linux uses hosted Ubuntu with Xvfb. Neither profile contains private account data. Source fixtures supply file-picker destinations and permission denial, so actual OS dialogs, media/device selection and broad keyboard/focus/accessibility remain open. The same-engine original-factory transition does not qualify arbitrary historical profiles or remote/copied roots.

The actual packaged RFC 9110 and MDN JavaScript documents returned secure HTTP 200 responses and rendered content without Node `require` or the privileged browser bridge. These two cases do not qualify authenticated accounts or all Internet sites. Extension acceptance uses generated fixtures in the source application, including a content-only MV3 fixture without a worker. It does not qualify real third-party packages, general MV3 workers, all API semantics or extension installation in the packaged application.

## Historical native fixture checkpoint at ac3a92f6

[Contract run 43769631902](https://github.com/Herbertofury/Noxviola/actions/runs/43769631902) passed **156 contracts and 39 JavaScript syntax checks** on both platforms for `ac3a92f6`. The native run used one generated profile and loopback origin across a legacy writer and two production processes:

| Hosted platform | Legacy seed | First production process | Restart process | Retained artifact |
| --- | --- | --- | --- | --- |
| Ubuntu 22.04 runner | 3/3 passed | 13/13 passed | 6/6 passed | [14183636721](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926/artifacts/14183636721) |
| Windows Server 2025, build 26100 | 3/3 passed | 13/13 passed | 6/6 passed | [14183463943](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926/artifacts/14183463943) |

All three processes exited cleanly. Each host recorded **31 source inputs**, a clean checkout and an unchanged before/after manifest. The JSON retains full artifact digests and separate raw source manifests. Linux input bytes matched the Git LF blobs. Windows' 30 text inputs matched the verified LF-to-CRLF checkout transformation and its PNG matched exactly; its source bytes were not identical to Linux or the raw Git text blobs. This Windows runner is not the owner's Windows 11 desktop.

The original `fromPartition` personal identity wrote the five generated web stores before production started. Production read those values before overwrite, verified the same physical directory and then verified normal process restart. Windows exercised the transition to an ordinary compact `fromPath` junction; Linux retained `fromPartition`. Persistent cookies survived while a separate session-only cookie expired. This establishes the recorded same-engine fixture transition, not every historical Chromium profile, remote filesystem or redirected root.

The native checks also reached more than twelve live duplicate tabs, actual split bounds, DownloadItem controls, generated MV3 content-script storage, persistent MV2 messaging, background destruction/re-enable/restart, uninstall, and complete fixture library metadata restart. The renderer's real identity selectors, consent checkbox and Install handler were exercised, with the preview dismissed and installed status rows present. The MV3 fixture has no background worker. Uninstall evidence concerns future injection and background execution, not erasure of stored extension data.

The harness supplies native file-picker choices and permission denial; it does not qualify OS dialog interaction, media/device pickers, keyboard/focus or complete accessibility. Real Internet sites, authenticated accounts, real third-party extension packages, marketplace trust, network/telemetry auditing and equivalent-workload performance remain open. The process metrics are milestone observations, not a speed, memory-efficiency or zero-network-traffic result. No master gate or full capability status was promoted.

The site permission service currently denies opaque and non-web origins, including `chrome-extension://` popup/options pages. Installing an extension does not grant those pages camera, microphone or other site capabilities. A future extension-specific path must bind the loaded runtime ID, actual sender, identity and approved scope; it must not broaden the generic web-origin policy.

Twenty focused Node permission contracts passed at this checkpoint. They cover persistence/restart, origin and identity isolation, deduplication, per-document lifetime, navigation/crash/disposal cancellation, failed durable writes, explicit recovery and future-schema preservation. They use synthetic sessions and frames. They are not native permission acceptance or a claim of a fully qualified browser.

The permission hot path uses indexed rule lookup and event-driven invalidation. It does not poll, scan the filesystem per permission check or broadcast an unchanged ledger on ordinary navigation. Whole-process latency, memory, CPU and battery comparisons have not been measured, so these design choices are not advertised as a measured speed advantage.

## Next implementation sequence

1. **Qualify the changed source and extend the passing packaged workflow.** Run the next exact revision for local spelling controls, optional private-memory reporting and the bounded real-package lane. Retain crash/save-failure recovery, split focus, camera/microphone/notifications, OS picker interaction and authenticated-account behavior as additional acceptance. The unavailable local native route remains blocked.
2. **Extend the authenticated extension host from actual receipts.** Keep the passing generated bridge and image stages as a regression baseline. Exercise real toolbar popup/click and API behavior, then add missing members over canonical services. Dynamic optional grants, content-world expansion, MV3 worker lifecycle and full browser-specific semantics remain open; preserve explicit errors rather than successful no-ops.
3. **Establish a real extension compatibility corpus.** Exercise exact upstream versions from filtering, password-manager, theme, userscript, tab/workspace, media, sidebar and developer-tools families. Record installation separately from each intended workflow, update/removal, performance and trust result. A prepared corpus runner does not itself qualify any package.
4. **Complete the shared-service workflows.** The recorded history, nested bookmarks and local workspace/group UI now have actual packaged restart evidence. Extend native failure/recovery and large-dataset acceptance, then implement missing interchange, tag/range/bulk controls and a real multiple-window model. Keep identity ownership and permission admission in shared services.
5. **Continue the complete browser/settings audit and equivalent-work evaluation.** Resolve every feature-index link and API member, inspect Windows synthetic profiles when supported access exists, and compare preserved workloads with exact environment/resource evidence. Add records whenever discovery requires them; performance superiority and zero first-party telemetry stay evidence-gated requirements.

## Reading the bounded network and resource evidence

The packaged driver starts the manifest-verified executable through its ordinary ASAR entry and observes it externally. Actual `3253` source/package artifacts and raw network/resource files are retained. Their finite measurements qualify the recorded observations, not universal absence or a comparison with another browser. Earlier `0e8601a` traffic analysis remains historical evidence: the Linux dictionary CDN download was an engine request absent from page-target CDP, while MDN-initiated telemetry POSTs were website traffic during the requested page visit. The incomplete Windows failed-restart NetLog remains unknown, not zero. See [the driver](../tests/native/packaged-driver.cjs) and [privacy findings](browser/PRIVACY.md).

- CDP `Network.requestWillBeSent` records request-start observations, including redirect hops. They do not establish unique wire requests, and cache/service-worker responses must remain distinguishable. Target attachment URLs are observations, not requests.
- Chromium NetLog URL-bearing events and native source IDs must be counted separately. A hostname appearing in an engine event does not by itself establish a connection, initiating actor, telemetry purpose or first-party ownership.
- The fresh blank-page observation records its duration and renderer-event count delta. It lacks explicit start/end markers for an exact NetLog interval; neighboring milestone timestamps provide only approximate alignment. CDP begins after attachment and does not capture Node or OS traffic.
- Resource observations are explicit milestones under instrumentation. Shared working-set sums can count the same physical pages more than once; per-renderer JavaScript heap, process cumulative CPU seconds and native interval CPU percentages are different measurements. Missing values remain unknown.
- Public-page navigation timings include only the explicitly recorded pages and instrumentation. No universal zero-telemetry result, complete privacy/security acceptance or comparative speed/memory advantage follows from this finite workflow.

## Updating and accepting a record

Use stable capability IDs and increment the inventory version when the inventory changes materially. Preserve source date, reference version, code paths and the exact acceptance scope. Add variant records where two browsers' behavior would otherwise be flattened. Keep every missing option or unresolved dependency visible in `configuration.remaining`, notes, evidence and the next action.

`absent` means no implementation of the scoped contract was found in the reviewed source. `partial` means behavior or required semantics are still missing. `implemented-unverified` means source exists but its stated end-to-end acceptance is unproven. `blocked` identifies a real dependency, while retaining the goal. `verified` requires repeatable evidence for the entire declared scope; successful parsing, compilation, a mock adapter or a screenshot alone cannot promote an extension or browser workflow.

All **G001–G012** remain open. In particular, documentation coverage, a production release, universal extensions, the complete feature superset, zero first-party telemetry, full-process efficiency, security and final product superiority have not been established by this checkpoint.

## Installed Windows audit procedure, still unresolved

When supported access becomes available, record each executable and installed version without modifying a personal profile. Use a fresh synthetic profile where possible. Inventory menus, settings, shortcuts, flags, policy controls, sidebar modules, extension surfaces and service dependencies; record defaults, valid ranges, reset behavior, persistence and keyboard/screen-reader interaction. Distinguish availability by account, locale, channel and enterprise policy.

Run identical synthetic workflows in each reference browser and Noxviola. Capture exact builds, configuration, datasets, hardware, full-process/resource observations and outcome. Keep raw private account/profile data out of repository fixtures and public logs. Access to a Linux workspace or public browser documentation does not close this Windows audit.
