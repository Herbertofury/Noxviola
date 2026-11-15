# Browser capability audit and implementation ledger

**Inventory version: 2026-11-15.2. This is an initial documented inventory with scoped native evidence, not a completed four-browser audit.** The target is the complete applicable union in the [unchanged master goal](browser/MASTER-GOAL.md). There is no feature-count ceiling and no acceptance gate is closed by this inventory.

The ledger now retains [actual Windows/Linux runtime evidence at `6fccdd2`](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107), including the exact failures. Twelve affected capabilities name their scoped passing or failing workflows. The complete acceptance procedures and statuses remain open: the Linux MV2 background-start ordering and Windows second-identity cache write failures prevented restart and later workflows in that run. A synthetic fixture result does not qualify an entire extension ecosystem or the user's installed browsers.

The canonical, searchable data is [browser/capabilities.json](../browser/capabilities.json). Its [Markdown index](browser-capabilities-index.md) is a reading aid; the browser's explicitly opened Capabilities panel reads the same JSON. This checkpoint expands **183 behavior records and 100 source records**, with further discovery queues. Counts describe the work recorded so far, not the final scope.

## What was actually inspected

The research used vendor feature indexes, support documentation, release notes, WebExtension API references and maintained host implementations. Noxviola source was reviewed from PR #5's `362fb016c2239c6a00ef844357f0bb1dccf282b3` baseline and the current local continuation. The declared Electron dependency is now **44.11.3**; that declaration is separate from evidence of an executed native browser.

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

These source improvements belong to the Electron PR #5 continuation. Native verification remains a separate gate.

| Area | Source now present | Missing acceptance or capability |
| --- | --- | --- |
| Session reliability | Validated private checkpoints, previous-data preservation, explicit recovery, coalesced session writes and close/save-failure handling. | Native crash/restart, shutdown failure and real large-tab/session workflows. |
| Favorites vault | Edit, reversible archive, search, export, deterministic reviewed JSON import and corruption-preserving storage. | Real UI import/export/restart and failure/cancel acceptance; rich bookmark tree, media storage and sync remain additional work. |
| Site permissions | Both Electron handlers, separate camera/microphone rules, per-identity/requesting/embedding origin decisions, document-only grants, durable allow/block, review/reset and explicit recovery. | Native frame/OS behavior; secure source/device pickers; precise effect of revocation on already-running capture. |
| Downloads | Explicit native destination chooser, identity-tagged progress, pause/resume/cancel, completed-file reveal and close handling. | Native interrupted transfers, persistent history and terminal retry. |
| Extensions | Owned previews, unpacked/ZIP/XPI inspection, unchanged-byte consent, persistent identity enrollment, actual engine load/unload outcomes and secure declared page routes. | Verified package signatures, updates, data erasure, full extension API semantics and real extension functionality. |
| Capability ledger | One versioned JSON inventory and searchable panel. | Installed-browser audit, all settings/member expansion and final union coverage. |

The site permission service currently denies opaque and non-web origins, including `chrome-extension://` popup/options pages. Installing an extension does not grant those pages camera, microphone or other site capabilities. A future extension-specific path must bind the loaded runtime ID, actual sender, identity and approved scope; it must not broaden the generic web-origin policy.

Twenty focused Node permission contracts passed at this checkpoint. They cover persistence/restart, origin and identity isolation, deduplication, per-document lifetime, navigation/crash/disposal cancellation, failed durable writes, explicit recovery and future-schema preservation. They use synthetic sessions and frames. They are not native permission acceptance or a claim of a fully qualified browser.

The permission hot path uses indexed rule lookup and event-driven invalidation. It does not poll, scan the filesystem per permission check or broadcast an unchanged ledger on ordinary navigation. Whole-process latency, memory, CPU and battery comparisons have not been measured, so these design choices are not advertised as a measured speed advantage.

## Next implementation sequence

1. **Finish actual P0 acceptance on a supported desktop.** Exercise the final packaged source through navigation, split focus, save/recovery, camera/microphone/notifications and download destination/cancel/resume. Use synthetic sites and identities. Retain exact runtime version, source revision, fixture digest and failure evidence. The unavailable local native route is a blocker, not a pass.
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
