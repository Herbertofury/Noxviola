# Browser capability audit and implementation ledger

**Inventory version: 2026-11-15.4. This is an initial documented inventory with scoped historical native evidence, not a completed four-browser audit.** The target is the complete applicable union in the [unchanged master goal](browser/MASTER-GOAL.md). There is no feature-count ceiling and no acceptance gate is closed by this inventory.

Historical source-bound receipts retained in this document include [`ac3a92f628519ae14f04a0499a665af8a7d89110`](https://github.com/Herbertofury/Noxviola/commit/ac3a92f628519ae14f04a0499a665af8a7d89110). Its [native run 43769631926](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) passed the legacy seed and both production processes on hosted Linux and Windows. Fifteen exercised capabilities now retain the precise passing scope, including normal session restoration and library metadata restart. Every complete capability status, acceptance procedure and master gate remains unchanged. A generated-fixture result does not qualify an entire extension ecosystem or the owner's installed browsers.

The earlier failing [6fccdd2](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107), [5403076](https://github.com/Herbertofury/Noxviola/actions/runs/43767668070) and [d98cdd5](https://github.com/Herbertofury/Noxviola/actions/runs/43769036713) runs remain in the ledger history and [source checkpoint](browser/CHECKPOINT-2026-11-15.md). The rejected global-namespace candidate, MV2 startup ordering failure and invalid session-cookie expectation retain their historical failed outcomes.

The new implementation milestone was published as [`2dc77c2a482f6a9d1c84335abfe1e873cb08758a`](https://github.com/Herbertofury/Noxviola/commit/2dc77c2a482f6a9d1c84335abfe1e873cb08758a), continuing the prior `d2c347a5` checkpoint. Its [native run 43776366374](https://github.com/Herbertofury/Noxviola/actions/runs/43776366374) failed at the Linux native extension installer and Windows ASAR-path contract. The causes, retained receipts and narrow repairs are recorded in the [checkpoint](browser/CHECKPOINT-2026-11-15.md). The new services, customization, host bridge and packaged executable still require their own passing source-bound receipts; historical fixture passes do not qualify them.

The canonical, searchable data is [browser/capabilities.json](../browser/capabilities.json). Its [Markdown index](browser-capabilities-index.md) is a reading aid; the browser's explicitly opened Capabilities panel reads the same JSON. This checkpoint updates 30 existing implementation records and retains all **183 behavior records**, with **110 source records** and further discovery queues. Counts describe the work recorded so far, not the final scope.

## What was actually inspected

The research used vendor feature indexes, support documentation, release notes, WebExtension API references and maintained host implementations. Noxviola source was reviewed from PR #5's `362fb016c2239c6a00ef844357f0bb1dccf282b3` baseline through the published `2dc77c2` continuation. The historical verified `ac3a92f6` fixture runtime used **Electron 44.11.3, Chromium 152.0.7977.169 and Node 24.22.2**. Later source changes require their own evidence; the ledger names the exact tested snapshot.

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

These implementations belong to the Electron PR #5 continuation. Source and portable contracts establish the bounded behavior below; **new native and packaged-executable acceptance remains pending**. The ledger preserves missing fields, variants and full acceptance procedures instead of treating available source as completion.

| Area | Current implemented scope | Remaining qualification or behavior |
| --- | --- | --- |
| Independent preferences | Validated home/custom search, dark/light/system appearance, accents/density, toolbar/bookmarks-bar visibility, configurable shortcuts with conflicts/disable/reset, and reviewed preference preset import/export. [Source](../browser/preferences.cjs), [contracts](../tests/preferences.test.cjs). | Native menu/focus/IME behavior, actual picker/output interaction, complete startup modes, richer themes/fonts/assets and full accessibility. |
| History | Canonical identity-owned page/visit records from committed HTTP(S) main-frame navigation, search, visit/range deletion, clear, recording pause, retention and explicit recovery. [Source](../browser/history.cjs), [contracts](../tests/history.test.cjs). | Native commit/title/redirect timing, UI date/range workflows, interchange, large-history write/search cost and packaged restart. |
| Hierarchical bookmarks | Stable tree IDs, protected roots, folders/separators/tags/order, durable edits/moves/deletes, search/recent APIs, a bookmarks bar and forms that retain their original identity through profile changes. [Source](../browser/bookmarks.cjs), [DOM contracts](../tests/renderer-product.test.cjs). | Native workflows, complete tag/reordering UI, HTML/JSON interchange, large-tree behavior and complete upstream API semantics. The vault remains a separate rich-reference concept. |
| Workspaces and groups | Durable local named/color definitions, saved tab membership, collapsed groups and assignment/switching that preserves background tabs and account identities. [Source](../browser/workspaces.cjs), [contracts](../tests/workspaces.test.cjs). | Native focus/layout/restart, whole-group close/reopen, bulk operations, extension tabGroups, sync and collaboration. |
| Browser controls | Canonical pin/reorder and audible/mute state; find match controls; bounded saved origin zoom; native print/PDF and visible-page PNG commands with explicit destinations. [Integration](../browser/main.cjs), [saved-state contracts](../tests/preferences.test.cjs). | Actual sound/find/zoom/print behavior, OS dialogs, output quality, complete save-page formats and native keyboard/accessibility acceptance. |
| Resource monitor | Explicit process CPU/memory/sandbox samples with available tab/extension-view owners, unknown first CPU interval and disclosed shared-process limits. [Source](../browser/resources.cjs), [contracts](../tests/resources.test.cjs). | OS correlation, worker attribution, observation overhead, broader GPU/disk/network metrics and equivalent-workload comparisons. No limiter or efficiency advantage is claimed. |
| Extension host | Authenticated extension documents/observed workers; canonical tabs, single real window, bookmarks/history, host-filtered cookies, native menu models and toolbar actions, with real callback/Promise adaptation and stable/native tab-ID mapping. [Exact API subset and licenses](browser/EXTENSION-ARCHITECTURE.md). | New native fixture and real upstream package corpus, full windows/icons/pageAction, optional grants, content-world expansion, MV3 worker startup/wake and complete browser-specific API semantics. |

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

## Verified native fixture checkpoint

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

1. **Extend native acceptance beyond the passing generated workflows.** Exercise crash/save-failure recovery, split focus, camera/microphone/notifications, native picker interaction and the final packaged application; then qualify real Internet and authenticated-account behavior with explicit consent. Retain exact runtime version, source revision, fixture digest and failure evidence. The unavailable local native route remains blocked.
2. **Qualify the selectively integrated extension host.** Run the new native bridge fixture against actual toolbar actions, tab IDs, canonical data and permission boundaries, then add missing APIs over the same services. Required manifest/host admission and sender/epoch authentication now exist in source; dynamic optional grants, real-package coverage and MV3 worker lifecycle remain open. Preserve explicit rejections rather than successful no-ops.
3. **Establish a real extension compatibility corpus.** Include representative filtering, password-manager, theme, userscript, tab/workspace, media, sidebar and developer-tools extensions from each target ecosystem. Use synthetic credentials and exact package versions. Record installation separately from every intended functional workflow, update/removal, performance and trust result.
4. **Complete the shared-service workflows.** History, hierarchical bookmarks and local workspace/group definitions now have canonical durable services and integrated UI. Qualify native restart/recovery and large datasets, then implement missing interchange, tag/range/bulk controls and a true multiple-window model. Keep identity ownership and permission admission in the shared boundary.
5. **Continue the complete browser/settings audit.** Resolve every feature-index link and API member, then inspect real Windows synthetic profiles when access is available. Preserve retired variants and meaningful differences. Add more records whenever discovery requires them.

## Reading pending network and resource evidence

The packaged driver starts the manifest-verified executable through its ordinary ASAR entry and observes it externally. Its network and resource files will be analyzed when downloaded; their presence in the harness is not a runtime result. See [the frozen driver](../tests/native/packaged-driver.cjs).

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
