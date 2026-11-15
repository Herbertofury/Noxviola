# Browser capability audit and implementation ledger

**Inventory version: 2026-11-15.3. This is an initial documented inventory with scoped native evidence, not a completed four-browser audit.** The target is the complete applicable union in the [unchanged master goal](browser/MASTER-GOAL.md). There is no feature-count ceiling and no acceptance gate is closed by this inventory.

The last verified runtime snapshot is [`ac3a92f628519ae14f04a0499a665af8a7d89110`](https://github.com/Herbertofury/Noxviola/commit/ac3a92f628519ae14f04a0499a665af8a7d89110). Its [native run 43769631926](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) passed the legacy seed and both production processes on hosted Linux and Windows. Fifteen exercised capabilities now retain the precise passing scope, including normal session restoration and library metadata restart. Every complete capability status, acceptance procedure and master gate remains unchanged. A generated-fixture result does not qualify an entire extension ecosystem or the owner's installed browsers.

The earlier failing [6fccdd2](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107), [5403076](https://github.com/Herbertofury/Noxviola/actions/runs/43767668070) and [d98cdd5](https://github.com/Herbertofury/Noxviola/actions/runs/43769036713) runs remain in the ledger history and [source checkpoint](browser/CHECKPOINT-2026-11-15.md). The rejected global-namespace candidate, MV2 startup ordering failure and invalid session-cookie expectation retain their historical failed outcomes.

The canonical, searchable data is [browser/capabilities.json](../browser/capabilities.json). Its [Markdown index](browser-capabilities-index.md) is a reading aid; the browser's explicitly opened Capabilities panel reads the same JSON. This checkpoint expands **183 behavior records and 100 source records**, with further discovery queues. Counts describe the work recorded so far, not the final scope.

## What was actually inspected

The research used vendor feature indexes, support documentation, release notes, WebExtension API references and maintained host implementations. Noxviola source was reviewed from PR #5's `362fb016c2239c6a00ef844357f0bb1dccf282b3` baseline through the published continuation. The verified `ac3a92f6` fixture runtime used **Electron 44.11.3, Chromium 152.0.7977.169 and Node 24.22.2**. Later source changes require their own evidence; the ledger names the exact tested snapshot.

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

Electron explicitly targets a subset of Chrome extension behavior. The pinned 44.11.3 source documentation differs from the moving latest website, including storage descriptions. The maintained adapter inspected during this continuation also has concrete permission and caller-authentication gaps. The [host comparison](browser-capabilities-extension-hosts.md) and [package-level audit](browser/EXTENSION-ARCHITECTURE.md) record the evidence and the reuse path.

Extension variants in the registry describe target compatibility contracts. An associated browser name does not assert that all listed API members or options exist in that browser. Portable Safari JavaScript is distinct from Apple native app components. Successfully extracting XPI or CRX content is distinct from validating its publisher signature.

## Current Noxviola checkpoint

These source improvements belong to the Electron PR #5 continuation. The passing fixture scope below is separate from each capability's complete acceptance contract.

| Area | Source and scoped evidence | Missing acceptance or capability |
| --- | --- | --- |
| Session reliability | Validated private checkpoints, previous-data preservation, explicit recovery and coalesced writes. Normal close/restart restored ordered duplicate tabs, profiles and active selection on both hosted platforms. | Native crash/interrupted-save recovery, shutdown failure, corrupt/future formats and canceled recovery. |
| Favorites vault | Edit, reversible archive, search, export, reviewed JSON import and corruption-preserving storage. Actual library IPC edit/archive/export/preview/cancel/merge and metadata restart passed. | All item types, complete search, native picker interaction, stale import sources and failed-write/recovery UI; rich bookmark tree, media storage and sync remain additional work. |
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
2. **Harden and reuse the maintained extension candidate.** Implement real optional-permission removal, effective API/host admission and sender authentication in the candidate before its browser APIs are enabled. Bind tab/window/action callbacks to the existing canonical browser services. Verify methods and events after revocation and across identities. Do not duplicate an entire browser or mask missing behavior with successful no-ops.
3. **Establish a real extension compatibility corpus.** Include representative filtering, password-manager, theme, userscript, tab/workspace, media, sidebar and developer-tools extensions from each target ecosystem. Use synthetic credentials and exact package versions. Record installation separately from every intended functional workflow, update/removal, performance and trust result.
4. **Expand high-value shared services.** A correct tab/window model, bookmark tree, history store and download service support both native browser UI and extension APIs. Reuse one implementation per domain and make permissions part of the dispatch boundary. Existing vault references can inform bookmarks without pretending a flat reference collection already implements a bookmark tree.
5. **Continue the complete browser/settings audit.** Resolve every feature-index link and API member, then inspect real Windows synthetic profiles when access is available. Preserve retired variants and meaningful differences. Add more records whenever discovery requires them.

## Updating and accepting a record

Use stable capability IDs and increment the inventory version when the inventory changes materially. Preserve source date, reference version, code paths and the exact acceptance scope. Add variant records where two browsers' behavior would otherwise be flattened. Keep every missing option or unresolved dependency visible in `configuration.remaining`, notes, evidence and the next action.

`absent` means no implementation of the scoped contract was found in the reviewed source. `partial` means behavior or required semantics are still missing. `implemented-unverified` means source exists but its stated end-to-end acceptance is unproven. `blocked` identifies a real dependency, while retaining the goal. `verified` requires repeatable evidence for the entire declared scope; successful parsing, compilation, a mock adapter or a screenshot alone cannot promote an extension or browser workflow.

All **G001–G012** remain open. In particular, documentation coverage, a production release, universal extensions, the complete feature superset, zero first-party telemetry, full-process efficiency, security and final product superiority have not been established by this checkpoint.

## Installed Windows audit procedure, still unresolved

When supported access becomes available, record each executable and installed version without modifying a personal profile. Use a fresh synthetic profile where possible. Inventory menus, settings, shortcuts, flags, policy controls, sidebar modules, extension surfaces and service dependencies; record defaults, valid ranges, reset behavior, persistence and keyboard/screen-reader interaction. Distinguish availability by account, locale, channel and enterprise policy.

Run identical synthetic workflows in each reference browser and Noxviola. Capture exact builds, configuration, datasets, hardware, full-process/resource observations and outcome. Keep raw private account/profile data out of repository fixtures and public logs. Access to a Linux workspace or public browser documentation does not close this Windows audit.
