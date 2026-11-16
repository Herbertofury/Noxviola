# Browser capability audit and implementation ledger

**Inventory version: 2026-11-16.5. This is an initial documented inventory with scoped source and packaged runtime evidence, not a completed four-browser audit.** The target is the complete applicable union in the [unchanged master goal](browser/MASTER-GOAL.md). There is no feature-count ceiling and no acceptance gate is closed by this inventory. Original research dates and reference-browser release bases remain unchanged.

The latest fully verified core checkpoint is [`999428099f5d59d91f7c437ae6eace2cdbe0264a`](https://github.com/Herbertofury/Noxviola/commit/999428099f5d59d91f7c437ae6eace2cdbe0264a), tree `f4e8f803698ba2125e8d8a964a675446aa102843`. Its [core run 43782744635](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635) passed **302 contracts / 76 syntax checks**, source stages **3/18/10** and ordinary packaged stages **11/6** on both platforms; independent full-artifact readback is complete. The detailed `ff5432c` feature receipts and later 504 global receipt remain preserved at their exact sources, without duplicating scoped feature receipts for another regression run.

The separate [999 real-extension run](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653) **failed during actual package initialization** on both platforms after the light baseline, reviewed installation and persistent background startup passed. The unchanged package raised `TypeError: Cannot read properties of null (reading 'applyToListedOnly')` in `UserStorage.migrateSiteListsV2`; actual page darkening failed, and later popup/Settings/restart workflows remain unqualified. The earlier 504 harness-inspection failures remain historical failures. **Electron 45.3.2 is a pending candidate, not a qualified repair or a Dark Reader pass.**

The canonical, searchable data is [browser/capabilities.json](../browser/capabilities.json). Its [Markdown index](browser-capabilities-index.md) is a reading aid; the browser's explicitly opened Capabilities panel reads the same JSON. This update retains **183 capability IDs**, every original reference variant and full acceptance procedure, and expands source records from **135 to 139** without a scope ceiling. It adds one global `999` core checkpoint and its separate failed real-package result while preserving all **140 scoped receipts**, including the forty detailed `ff` receipts, without changing capability statuses. The earlier local-writing/screenshot corrections remain `partial`; no complete capability or master gate becomes verified.

The earlier [ac3a92f6](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) and [d2c347a5](https://github.com/Herbertofury/Noxviola/actions/runs/43770224325) source passes remain source-bound history. The failing [6fccdd2](https://github.com/Herbertofury/Noxviola/actions/runs/43766771107), [5403076](https://github.com/Herbertofury/Noxviola/actions/runs/43767668070) and [d98cdd5](https://github.com/Herbertofury/Noxviola/actions/runs/43769036713) runs retain their outcomes, including the rejected global-namespace candidate, MV2 startup ordering failure and invalid session-cookie expectation. Later failures are preserved as well:

| Published revision | Retained overall result | Causal finding and scope |
| --- | --- | --- |
| [2dc77c2](https://github.com/Herbertofury/Noxviola/actions/runs/43776366374) | Failed; packaged execution not reached | Linux's native background rejected unconditional contextBridge installation. Windows failed ASAR member lookup with host separators before Electron execution. |
| [b31e398](https://github.com/Herbertofury/Noxviola/actions/runs/43776959473) | Source passed; overall packaging stage failed | Both source flows passed 3/14/7 checks. npm 10 left empty top-level dependency scope directories in the disposable production staging tree; no packaged executable started. |
| [0e8601a](https://github.com/Herbertofury/Noxviola/actions/runs/43777321374) | Packaged first process passed 10/10; restart failed | URL-only readiness accepted an already-open duplicate before the selected page committed. The Windows failed second-phase NetLog is incomplete, so complete traffic counts remain unknown. |
| [12d924a](https://github.com/Herbertofury/Noxviola/actions/runs/43777606408) | Packaged first process passed; restart still failed | Correct target readiness exposed the remaining harness defect: renderer window.close() bypassed the preventable native window-close path. The replacement requests the real OS protocol and checks saved data before relaunch. |
| [ae00b562](https://github.com/Herbertofury/Noxviola/actions/runs/43779608696) | Core source failed; packaging not reached | The spelling-form assertion compared an empty shortcut override map with explicitly saved defaults. The later repair compares effective bindings and unrelated preferences while retaining the original raw values. |

Full artifact digests, raw logs and repair history are retained in the ledger and [source checkpoint](browser/CHECKPOINT-2026-11-15.md). Later success does not rewrite any earlier failed gate. Local spelling state and optional Windows private-memory reporting have scoped `0c` and `ff` receipts. The separate real-extension attempts at `ae00`, `0c` and `f76` failed at different stages and remain failures; a passing core run does not qualify those packages.

## What was actually inspected

The research used vendor feature indexes, support documentation, release notes, WebExtension API references and maintained host implementations. Noxviola source was reviewed from PR #5's `362fb016c2239c6a00ef844357f0bb1dccf282b3` baseline through the verified `99942809` core checkpoint, retaining the failed `f47a4a3` attempt and separately failed real-package lane. The verified snapshot used **Electron 44.11.3, Chromium 152.0.7977.169 and Node 24.22.2**. The same engine versions at two revisions do not transfer acceptance automatically; each receipt names its tested source.

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

These implementations belong to the Electron PR #5 continuation. The following positive runtime claims are limited to `ff5432c` and its retained source/package receipts. The later 504 and 999 core regressions passed separately; dedicated added-query behavior is still unqualified, and the unchanged real package failed initialization at 999. Each complete capability stays partial or unverified where its wider contract remains open; available code and a scoped pass do not close missing variants.

| Area | Implemented scope and recorded runtime evidence | Remaining qualification or behavior |
| --- | --- | --- |
| Independent preferences | Validated home/custom search, appearance, toolbar visibility, shortcut conflicts/disable/reset and preset import/export exist in the [service](../browser/preferences.cjs). The actual packaged form applied vertical tabs, light theme, teal accent, compact density and the bookmarks bar; renderer attributes, page geometry and normal restart passed. | Home/custom-search choices, shortcut editing, preset/picker workflows, complete startup modes, mixed appearance combinations, fonts/assets and full native accessibility remain unqualified. |
| History | The [canonical identity-owned service](../browser/history.cjs) records committed HTTP(S) main-frame visits and supports search, deletion, pause/retention and explicit recovery. Packaged committed-title/query behavior, foreign-identity denial and stable page/visit data across restart passed. | Native range/delete/clear/retention/recovery workflows, interchange, complete redirect/title timing and large-history cost. |
| Hierarchical bookmarks | The [canonical tree](../browser/bookmarks.cjs) has stable IDs, protected roots, folders/separators/tags/order and durable edits/moves/deletes. Actual packaged forms created nested folders, edited/moved a bookmark with its ID intact and restored the tree after restart. The source bridge exercised bookmark CRUD and its creation event. | Full tag/reordering UI, HTML/JSON interchange, failure/recovery, large trees and all upstream API semantics. The rich-reference vault remains separate. |
| Workspaces and groups | [Local named/color definitions](../browser/workspaces.cjs), tab membership, collapsed groups and identity-preserving organization are implemented. Packaged forms created and assigned definitions, updated count/removal controls, retained pin/mute and restored stable IDs plus the active workspace. | Complete focus/switching/drag behavior, group bulk/close/reopen, extension tabGroups, sync and collaboration. |
| Browser controls | In [integration](../browser/main.cjs), actual source Find produced three matches and ordinal sequence 1 → 2 → 1 with counters and cleared highlighting. Origin zoom changed real viewport scale, stayed isolated by identity and survived restart. Generated PDF/PNG output and cancellation preservation passed; packaged pin/mute and ordering remain scoped receipts. | Real sound/indicators, broader text/page/focus behavior, physical menu/picker interaction, printers, full save-page formats, region/full-page capture, arbitrary output fidelity and packaged page-tool workflows remain unqualified. |
| Resource monitor | Nine packaged samples per platform used the actual [resource service](../browser/resources.cjs). Every reported Windows private-memory row and complete sum was valid; all Linux private values/totals remained explicitly unavailable. CPU/working-set and CDP observations remain separate. No sampling loop or limiter is added. | Full OS-process coverage, shared/worker attribution, observation overhead, GPU/disk/network scope and equivalent-workload comparisons. Private bytes are not PSS or deduplicated physical memory. |
| Local spelling subset | Three real checkbox saves changed the default and existing/later identity Sessions; disabled state and the visible setting survived source restart in both `0c` and `ff`. Seven first-process snapshots and one restart snapshot per platform were read back. | Native correction selection, language/dictionary UI, grammar and supported dictionary-download opt-out remain open. Packaged spelling-specific operation was not exercised. |
| Durable download history | The [canonical service](browser/DOWNLOADS.md) retains complete identity-tagged metadata and distinguishes restored rows from live DownloadItems. In `ff`, three terminal rows and two exact 94,208-byte files survived normal restart. Real identity-scoped Clear removed the two Personal metadata rows, retained the other identity record, and preserved both files. | Active-transfer restart, network interruption, recovery/failed-save UI, close-time cancellation failure, actual picker interaction and packaged downloads remain open. No automatic resume, terminal retry or downloaded-file deletion is implemented. |
| Extension host | The generated source fixture passed callback/Promise and native-ID routing, canonical tabs/bookmarks, host/identity cookie admission, foreign denial, revocation, action state and six acknowledged image stages initially, after re-enable and after restart. [Exact subset and provenance](browser/EXTENSION-ARCHITECTURE.md). | The packaged workflow does not install extensions. Real upstream packages, MV3 worker startup/wake, optional grants, full windows/history/menu/action semantics, publisher trust, updates/rollback and universal compatibility remain open. |

### Local checking, memory and the changed download/page-tool source

The local spelling setting preserves the prior enabled default and controls checking/correction suggestions. It is excluded from appearance presets. **It does not block engine dictionary downloads or constitute download consent.** The pinned Session initializes dictionaries before the enabled setter, and a missing Hunspell dictionary can download independently of that preference. A supported downloader opt-out remains unresolved; no dummy URL, network interception or unsupported switch is presented as its solution. See the [privacy boundary and exact upstream sources](browser/PRIVACY.md). The `0c` and `ff` source receipts qualify actual checking state and restart, not grammar, native correction selection or downloader control. Other preference values and effective shortcuts were preserved; the first save materialized the raw default-shortcut map.

The `0c` and `ff` packaged samples qualify their reported optional Windows private-memory values and availability counts. Reported zero remains valid, invalid/missing values remain unknown, and a total requires valid values from every sampled process. Units are bytes converted from Electron's binary kilobytes (1,024 bytes). All nine Windows samples supplied valid private values for every reported process; all nine Linux samples kept them `null` with a zero reported count. This is coverage of the reported rows, not proof of all OS processes, PSS, deduplicated physical memory or efficiency.

The new [page-tool source workflow](../tests/native/page-tools.cjs) first failed at Find in `f47`; that original result is retained below. The causal `ff` translation repair passed unchanged native match/ordinal/selection/counter assertions and allowed the later history restart, origin zoom, PDF/PNG and cancellation checks to run. Both actual PDFs subsequently passed independent text/link/page-structure and visual readback. Supplied generated picker paths and direct native menu-handler invocation still do not qualify physical OS gestures, printers or arbitrary page fidelity.

The later 504 and 999 revisions have passed independent core regression receipts. Dedicated added-query behavior remains unqualified. The 504 real-package inspection failure and the subsequent actual 999 package-initialization failure retain their separate original outcomes; neither is relabeled by a core pass.

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

## Verified global core checkpoint at 99942809

The independent report `99942809-independent-validation.json` is **137,134 bytes**, SHA-256 `f6ec978cce64ad5c7f7c418d357ce4720efaee5f2f6a5083973598d90c938b20`. Both hosted job logs confirm **302 contracts / 76 syntax checks**. Source seed/first process/restart passed **3/18/10**, and ordinary packaged first process/restart passed **11/6** on both hosts. All **66 raw Git inputs** match with clean unchanged source manifest `43f3a149d6f30cb1b141d10b32b1de307e1233a49a1b70d005c3de1a3887546b`.

| Exact 999 outer artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux native 14189660084](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14189660084) | 4,976,634 | `3dfe768c40e8f10a82e6bb7074ba6690a0a25ac3df7cfb49c245861499b7a090` |
| [Windows native 14189135786](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14189135786) | 4,038,723 | `a453111d7c23f04cd1b88dcaf359414c0cbadc8b87eab68d7749a878f9638048` |
| [Linux portable 14189201144](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14189201144) | 123,515,852 | `635fd0019544a3d7b1d70b6fa95231c5b40f12f86f37f9d68d51992b37fbb78b` |
| [Windows portable 14188269280](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14188269280) | 158,626,795 | `9b8bdb6b8c1b16820a931331fcb083e4994857b4968405a553bfe527ad433bea` |

All **73 Linux / 74 Windows** inner distribution entries and **48 ASAR members** were independently verified. Both application manifests equal `cd0dc48b474130d4dc6b1fc6cb52976b55d047a5b7db5a6c0a1aa7753357777d`; complete ASAR bytes equal `c3b80cc90cbd036c661d5269cbb307c28859921c3312b6e6b8922ceacd3448d8`. Complete OS distributions, executables and runtime files remain different. The [release table](browser/RELEASES.md) distinguishes the tested inner previews from the outer artifact ZIPs.

The new PDF report `pdf-qa-99942809/pdf-content-validation.json`, **5,274 bytes**, SHA-256 `8b0bd829246da14bbbc22bc6ad40a7837afcab93c2813a078e65d4f33fdbae9a`, binds these exact generated PDFs and Poppler renders. Each actual PDF has one Letter page, the expected text, two clickable fixture links and a clean visual readback; no earlier PDF was substituted. Source-only download/history/Find/zoom/output scope, supplied picker choices, finite network/resource samples and hosted Windows Server/Ubuntu limits remain unchanged. No new capability status or master gate is promoted.

### Separate real-package failure and pending engine candidate

Run [43782744653](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653) has three passed checks followed by failed actual page darkening on each host. The unchanged package failed in `background/index.js:3488`, `UserStorage.migrateSiteListsV2`, while reading `applyToListedOnly` from null. Both receipts have **zero observer errors** and `completedWorkflows: false`; a committed background document does not prove successful initialization.

| Original failed real-package artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux real-package 14187924966](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653/artifacts/14187924966) | 86,633 | `f0d9b3ebbe8ac5b37dafad67723c1372678f84e0bc6983eca2cc173493e7ae09` |
| [Windows real-package 14189340184](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653/artifacts/14189340184) | 76,091 | `7cc06369409f5811e586bd2974e2d2d4f787c6141aa49d3557fdaccb0ef00594` |

The tested Electron 44.11.3 lacks native extension `storage.sync` used by the package. [Pinned Electron 45.3.2 documentation](https://github.com/electron/electron/blob/v45.3.2/docs/api/extensions.md) describes a genuine separate local sync area with Chrome sync quotas, **without cross-device synchronization**; managed storage is empty/read-only. The selected engine candidate still needs exact-source core/package regression, real storage separation/events/restart checks, every unchanged-package functional assertion and an actual **44.11.3 seed → 45.3.2 production** profile transition. Prior same-engine preservation does not qualify an engine upgrade. No candidate/native/Dark Reader pass is recorded here; all G001–G012 gates remain open.

## Verified global core checkpoint at 50431f79

The independent report `50431f79-independent-validation.json` is **138,485 bytes**, SHA-256 `e847f07f3dd54daff403376296d7b19bb347603ca45f7e326e32d893aee593bf`. All **66 raw Git inputs** match on both hosts, with clean unchanged source manifest `f9a374cc9245251b01c3c04815361ac37178933834112f1a092a32045d33f8f5`. All **73 Linux / 74 Windows** inner distribution entries and **48 ASAR members** were verified. Both application manifests equal `a81a1ab72ecde93e4077b44ef7590e618929b4c6d326020a0be568aa2fd8d9ed`; complete ASAR bytes equal `a7dbb4fae6c3f36b85fd5a58e1f0fefd32061de23c04afe52eb70d30a00d45d8`. Complete OS distributions remain different.

| Exact 504 outer artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux native 14189005081](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14189005081) | 4,971,810 | `f22c2f68908eb23dae1c5303245a215fc9b15ecc5d45b91964689e514935ab7a` |
| [Windows native 14188494117](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14188494117) | 4,048,943 | `e82a3b1b0ae40c29300b5667bd239c823ba47ee764fd70db100cc19b52616db2` |
| [Linux portable 14187899114](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14187899114) | 123,487,085 | `4f427ebee0359ac6cac9db203c8c1f6f3144a95a6cbb6ba42f9b189dab37bd9c` |
| [Windows portable 14189065350](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14189065350) | 158,597,991 | `59470aaa3eada00763a372f8663499659758c9eeade89b920c698a59e02451b9` |

The [release table](browser/RELEASES.md) records the exact inner previews. The new report preserves source-only page-tool/download scopes, supplied picker choices, hosted-platform limits and finite network/resource observations. Its actual new PDFs received separate text/link/visual readback; prior PDF bytes were not substituted. This is a global core regression receipt, not new acceptance of permission-query semantics, Dark Reader, universal extensions or any G001–G012 gate. The separate failed real-package run and its original artifacts remain in the JSON and [checkpoint](browser/CHECKPOINT-2026-11-15.md).

<a id="verified-source-and-packaged-checkpoint-at-ff5432c"></a>

## Historical source and packaged checkpoint at ff5432c

The [core native run](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795) used exact tree `b3d11cdfe2f319d7b993111b6c1e456eefa7c176`. Direct GitHub artifact metadata and successful job-step summaries were checked, followed by original artifact bytes, all native files, inner distributions and ASAR readback. Raw job logs confirm 289 tests passed, zero failed/skipped, and 73 syntax checks on each platform.

| Stage, per hosted platform | Passed | Qualification |
| --- | ---: | --- |
| Original-factory generated store seed | 3/3 | Same-engine Personal store before production readback. |
| First source application process | 18/18 | Existing core fixtures plus terminal download history, actual Find, generated output/cancellation and real viewport zoom. |
| Source application restart | 10/10 | Original metadata/store/extension checks plus download-history identity clear and retained exported bytes/zoom. |
| First ordinary packaged executable | 11/11 | Manifest-verified ASAR entry, product workflows, two public HTTPS pages and native close/save. |
| Packaged executable restart | 6/6 | Saved session, canonical product/identity data and a second native close/save. |
| Complete archive readback | 73 Linux / 74 Windows entries | Every inner distribution entry and all 48 ASAR members verified. |

All **65 raw source inputs** match Git exactly on both platforms. Source was clean and unchanged before/after execution; the shared input manifest is `eb0ded1e26069551016f332a1817e072089e98e8e745c1dfa72fc6ce11aec91c`. The application manifest is `75ab53c6b939824f01bb4feda06a1ab91c6eee52c2367ce90088eb9ef613afde`, and complete ASAR bytes match at `0acf056701eef83570c006b4bb3682209677d015b7f7364ab4e61250d91ea4b7`. Platform executables, runtime files, package manifests and complete archives remain different.

| Original outer artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux native 14188049470](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188049470) | 4,972,613 | `6bcb20b31d4e2dd85f99bd15ba718ced65948fe86ed9b63f6b6232f0911d59cf` |
| [Windows native 14188572863](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188572863) | 4,061,455 | `de209ba586479fc458006c0d1cab9be8dce8e087a21818eaad5f069cdc83db18` |
| [Linux portable 14188672341](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188672341) | 123,484,848 | `a8595fd9924c0cf43ab4e14af95e129033d001a2521fb7e7e5b16f4abb4d5ab3` |
| [Windows portable 14188816517](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188816517) | 158,595,956 | `e73ba954fd7ddab64f16524ebeb81926fb8798474076648dd72d7f6b93c2b9d1` |

The independent receipt `ff5432c-independent-validation.json` is **134,346 bytes**, SHA-256 `1047e597d540f45b27c392bb0575430e8e125f3b1ca196527c3645dfcc041365`. It records all 51 original files in each native artifact, every inner archive entry, exact source/ASAR checks, preserved saved-session fields, nine resource samples per platform and the specific download/page-tool assertions. [Release status](browser/RELEASES.md) distinguishes the inner archive hashes from the outer Actions artifacts.

Both completed downloads contain the exact 94,208-byte generated fixture, SHA-256 `b72e920bbdc509496f6e0288d088c591c0b73acd8e459b2011d35e3aad07a233`. Two completed records and one cancelled record retained IDs and full persisted metadata across normal restart. Restored rows had no native item or resume capability. The real Clear action removed Personal metadata only, retained the second identity's row, and left both completed files unchanged. This is an app-wide identity-tagged list, not confidentiality between identities or forensic erasure.

Find produced three native matches and final ordinals **1 → 2 → 1** with nonempty selection geometry; real counter and Escape/highlight-clearing assertions passed. Each **1320 × 748** visible-page PNG independently decoded to the same BGRA hash as the native bitmap, also matching the cleared-page bitmap. Zoom changed actual viewport dimensions, reset correctly, preserved the selected personal-origin factor across same-origin navigation and restart, and kept the second identity at factor 1.

The original CI receipts explicitly report unavailable PDF reader tools. Subsequent independent readback of the retained exports is captured separately in `pdf-qa-ff5432c/pdf-content-validation.json`, **5,262 bytes**, SHA-256 `ae701d478443cb545a7a08fe4f92d94db27c9e125e7e97c768df9541194b2b85`. Both PDFs have one **612 × 792 point Letter page**, the expected heading/notice/link text, two clickable generated loopback links, and a clean 110 dpi Poppler render with no observed clipping, overlap or missing glyphs. The Linux PDF is 19,483 bytes, SHA-256 `36ca33b8e3e82d3421e3b9d52a562e9e98822808fd5a204f4f83852ae0417903`; Windows is 41,205 bytes, SHA-256 `26eb6355ac236155dd0947d2440c4be487cbbd0a53f4db56c381ac8edc6accb2`. Generated replacement Cancel preserved both existing 69-byte sentinel files, and all export bytes survived normal restart.

These new download/page-tool checks ran in the **source application**; the packaged workflow remains its separately stated 11/6 product subset. Physical OS menu/picker gestures, printers, arbitrary pages/pagination, full-page/region/clipboard capture, active-transfer restart, native recovery/failure UI and real third-party extension compatibility remain open. Windows is a hosted Server 2025 runner and Linux uses hosted Ubuntu/Xvfb. No owner Windows 11 audit, production release, full feature acceptance, zero-telemetry result or comparative efficiency is inferred.

<a id="verified-source-and-packaged-checkpoint-at-0c25987e"></a>

## Historical source and packaged checkpoint at 0c25987e

The [core native run](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365) used tree `532d4e6f3b0b5439a0aeec60bc2a6645ca623883`. Both hosted platforms passed independently recorded source and ordinary packaged-executable stages:

| Stage, per hosted platform | Passed | Boundary |
| --- | ---: | --- |
| Original-factory generated store seed | 3/3 | Same engine and original `fromPartition` Personal store before production readback. |
| First source application process | 15/15 | Generated local sites, identity stores, permission/download and authenticated extension fixtures, plus actual local spelling-setting changes. |
| Source application restart | 8/8 | Normal metadata/store/extension restart and the disabled local spelling choice. |
| First actual packaged executable | 11/11 | Ordinary ASAR entry, real product forms, two public HTTPS documents and native close/save. |
| Packaged executable restart | 6/6 | Ordered session and canonical product data, identity stores, saved preferences and a second native close/save. |
| Complete distribution readback | 73 Linux / 74 Windows entries | Every file entry matched its recorded size and digest; unsigned preview only. |

All five application/seed processes per host exited cleanly. The packaged close helper selected the unique visible top-level window owned by the launched PID and sent `WM_CLOSE` or `WM_PROTOCOLS/WM_DELETE_WINDOW`. It then required a clean exit and compared the saved ordered session fields before relaunch. Omitted default flags are normalized explicitly; this is complete tested-field comparison, not a claim of raw JSON byte identity. No artificial flush or forced termination counted as a successful close.

Both source and packaged receipts match **64 raw Git input blobs exactly**, with clean, unchanged before/after source and manifest `81ba838766fdfada2eb12a745c6741d7ca506d7383957fe8cff9c657c681cc11`. The final independent readback is retained as `0c25987e-independent-validation.json`, **62,959 bytes**, SHA-256 `3ea58a8ec1adcba161507dfae15372b9badbe644cd7fb0fbaf876158b0f7667b`. It verifies all four outer artifact archives, complete inner distribution entries and all **48 ASAR members**.

| Original outer artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux native 14188006519](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14188006519) | 4,910,756 | `6bd7fcbe9772c428700762c10b6d71c4e2a7b8ff570b92ec124714806ed6798c` |
| [Windows native 14188396094](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14188396094) | 3,974,101 | `8bd3d4e65896af2edde1d1365b452dda7f7a8adbf04d63378874c93ff71d099f` |
| [Linux portable 14187503341](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14187503341) | 123,479,343 | `c41f924ae354106cbe0e60033dcd5ddc37d53e35ecb116f7a9336da117f78c71` |
| [Windows portable 14187961704](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14187961704) | 158,590,616 | `07bb33335b7c195b26fc4235bf848b7e306e19660531ef59dbdc891a715175e7` |

The [release table](browser/RELEASES.md) records the exact inner distribution filenames and their different hashes. After pinning the two notice files to LF, both application manifests now equal `0691988d89778c5e659a2f6563c2fb44b6e3ba0a578f4f65a0b432e26f52eb81`, and the complete ASAR bytes equal `ff1b05e529013774d9033dd5901cbef0f2dcb5681d33f330e9a04b844e77a2e1`. No application-member difference remains in this checkpoint. The platform executables, runtime files, package manifests and complete distributions still differ; identical application ASAR bytes are not identical operating-system builds.

These are hosted Windows Server 2025 and Ubuntu/Xvfb results, not the owner's Windows 11 audit. The finite generated source fixtures, two public HTTPS documents and packaged product workflows do not qualify private accounts, all Internet sites, actual OS dialogs, all extension packages, dictionary-download opt-out, complete security/privacy or equivalent-workload efficiency. The separate `0c` real-extension run below failed before installation.

## Historical failed source and real-extension attempts

This section preserves the original f47-era status and failure evidence. The later ff core pass is recorded above; the real-extension failures remain unqualified.

The [f47 native run](https://github.com/Herbertofury/Noxviola/actions/runs/43780987710) passed its first **15 source checks per platform**, including two completed 94,208-byte files and three saved terminal download rows with real UI. Initial Find then produced **zero native `found-in-page` events**. Electron 44.11.3 maps `findNext: true` to a new search session and false to a follow-up; the product had reversed that translation. The causal repair keeps the native match, ordinal, selection and counter assertions unchanged. Its new receipt is pending. Download-history restart/identity clear, later page tools, source restart and packaging were not reached.

| Original failed f47 artifact | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Linux 14187847993](https://github.com/Herbertofury/Noxviola/actions/runs/43780987710/artifacts/14187847993) | 2,409,375 | `4f538e26063e7e0cdd4b6b7fc931f8427c980de1b3f11a0a6bdd903bb99241cb` |
| [Windows 14187978748](https://github.com/Herbertofury/Noxviola/actions/runs/43780987710/artifacts/14187978748) | 2,204,288 | `d11482db18ba9072b6a60b3611339650b103c4cd5f23c93f2b6bd64955708e2d` |

The real-extension lane retains a separate result for each unchanged upstream package attempt. Full original artifact IDs, sizes and digests are in `coverage.realExtensionHistory` and the [causal checkpoint](browser/CHECKPOINT-2026-11-15.md).

| Exact source / real-extension run | Actual reached stage | Retained failure |
| --- | --- | --- |
| [ae00b562 / 43779608644](https://github.com/Herbertofury/Noxviola/actions/runs/43779608644) | Before application startup or package execution | Both reached the 180-second deadline because the test driver used a CommonJS entry check incompatible with the Electron entry route. The later explicit entry guard did not modify the extension or relax the deadline. |
| [0c25987e / 43780308399](https://github.com/Herbertofury/Noxviola/actions/runs/43780308399) | Sandboxed light-page baseline; no extension installed | The driver clicked a hidden import control before the asynchronous Extensions panel rendered. Empty installed lists establish no real-package API behavior. |
| [f76e79d9 / 43780643491](https://github.com/Herbertofury/Noxviola/actions/runs/43780643491) | Windows reviewed installation and committed background document; Linux before installation | Windows Dark Reader 4.9.135 failed initialization when `background/index.js:6356` accessed `chrome.permissions.onRemoved` while `chrome.permissions` was absent. The page stayed light; a committed background document is not successful initialization. Linux's first baseline capture failed with `UnknownVizError`; a later diagnostic capture does not turn that failure into a pass. |

The accepted Dark Reader Chrome MV2 ZIP remained unchanged, SHA-256 `bf953c7dbe3dce677017c56d84969f51027a777189408ac19969bac9e0126b50`. No Dark Reader compatibility, successful real-package corpus, optional-grant support or subsequent repair is accepted by this inventory.

## Historical source and packaged checkpoint at 3253be62

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

1. **Qualify the published continuation and extend the proven core workflows.** Retain the verified 999 core regression and qualify the pending 45.3.2 native-storage candidate, unchanged real package and genuine 44-to-45 profile transition through their complete original assertions. Extend the passing download/history and Find/zoom/output source subsets to recovery, interrupted transfers and packaged operation. Crash/save-failure recovery, split focus, media/notifications, physical OS pickers and authenticated accounts remain additional acceptance; the unavailable local native route stays blocked.
2. **Extend the authenticated extension host from actual receipts.** Keep the passing generated bridge and image stages as a regression baseline. Exercise real toolbar popup/click and API behavior, then add missing members over canonical services. Dynamic optional grants, content-world expansion, MV3 worker lifecycle and full browser-specific semantics remain open; preserve explicit errors rather than successful no-ops.
3. **Establish a real extension compatibility corpus.** Exercise exact upstream versions from filtering, password-manager, theme, userscript, tab/workspace, media, sidebar and developer-tools families. Record installation separately from each intended workflow, update/removal, performance and trust result. The ae00, 0c and f76 failed attempts remain separate from the passing generated-fixture baseline; a prepared or repaired corpus runner does not itself qualify any package.
4. **Complete the shared-service workflows.** The recorded history, nested bookmarks and local workspace/group UI now have actual packaged restart evidence. Extend native failure/recovery and large-dataset acceptance, then implement missing interchange, tag/range/bulk controls and a real multiple-window model. Keep identity ownership and permission admission in shared services.
5. **Continue the complete browser/settings audit and equivalent-work evaluation.** Resolve every feature-index link and API member, inspect Windows synthetic profiles when supported access exists, and compare preserved workloads with exact environment/resource evidence. Add records whenever discovery requires them; performance superiority and zero first-party telemetry stay evidence-gated requirements.

## Reading the bounded network and resource evidence

The packaged driver starts the manifest-verified executable through its ordinary ASAR entry and observes it externally. Actual `ff`, `0c` and historical `3253` source/package artifacts and raw network/resource files are retained. Their finite measurements qualify the recorded observations, not universal absence or a comparison with another browser. Earlier `0e8601a` traffic analysis remains historical evidence: the Linux dictionary CDN download was an engine request absent from page-target CDP, while MDN-initiated telemetry POSTs were website traffic during the requested page visit. The incomplete Windows failed-restart NetLog remains unknown, not zero. See [the driver](../tests/native/packaged-driver.cjs) and [privacy findings](browser/PRIVACY.md).

- CDP `Network.requestWillBeSent` records request-start observations, including redirect hops. They do not establish unique wire requests, and cache/service-worker responses must remain distinguishable. Target attachment URLs are observations, not requests.
- Chromium NetLog URL-bearing events and native source IDs must be counted separately. A hostname appearing in an engine event does not by itself establish a connection, initiating actor, telemetry purpose or first-party ownership.
- The fresh blank-page observation records its duration and renderer-event count delta. It lacks explicit start/end markers for an exact NetLog interval; neighboring milestone timestamps provide only approximate alignment. CDP begins after attachment and does not capture Node or OS traffic.
- Resource observations are explicit milestones under instrumentation. Shared working-set sums can count the same physical pages more than once; per-renderer JavaScript heap, process cumulative CPU seconds and native interval CPU percentages are different measurements. Missing values remain unknown. The nine reported Windows private-byte totals in each recorded 0c/ff packaged workflow are valid sums, while Linux reports unavailability; neither establishes deduplicated physical memory or complete OS coverage.
- Public-page navigation timings include only the explicitly recorded pages and instrumentation. No universal zero-telemetry result, complete privacy/security acceptance or comparative speed/memory advantage follows from this finite workflow.

## Updating and accepting a record

Use stable capability IDs and increment the inventory version when the inventory changes materially. Preserve source date, reference version, code paths and the exact acceptance scope. Add variant records where two browsers' behavior would otherwise be flattened. Keep every missing option or unresolved dependency visible in `configuration.remaining`, notes, evidence and the next action.

`absent` means no implementation of the scoped contract was found in the reviewed source. `partial` means behavior or required semantics are still missing. `implemented-unverified` means source exists but its stated end-to-end acceptance is unproven. `blocked` identifies a real dependency, while retaining the goal. `verified` requires repeatable evidence for the entire declared scope; successful parsing, compilation, a mock adapter or a screenshot alone cannot promote an extension or browser workflow.

All **G001–G012** remain open. In particular, documentation coverage, a production release, universal extensions, the complete feature superset, zero first-party telemetry, full-process efficiency, security and final product superiority have not been established by this checkpoint.

## Installed Windows audit procedure, still unresolved

When supported access becomes available, record each executable and installed version without modifying a personal profile. Use a fresh synthetic profile where possible. Inventory menus, settings, shortcuts, flags, policy controls, sidebar modules, extension surfaces and service dependencies; record defaults, valid ranges, reset behavior, persistence and keyboard/screen-reader interaction. Distinguish availability by account, locale, channel and enterprise policy.

Run identical synthetic workflows in each reference browser and Noxviola. Capture exact builds, configuration, datasets, hardware, full-process/resource observations and outcome. Keep raw private account/profile data out of repository fixtures and public logs. Access to a Linux workspace or public browser documentation does not close this Windows audit.
