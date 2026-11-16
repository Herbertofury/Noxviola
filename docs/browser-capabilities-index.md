# Browser capability index

Inventory version **2026-11-16.1**; original documentation audit 2026-11-15. **Initial documented inventory; incomplete.** The latest verified runtime checkpoint is `3253be620fb8065a59e7be84ee2027e4a6993a19`: its scoped source and ordinary packaged-executable workflows passed on hosted Windows/Linux, including actual native close, immediate saved-session comparison and restart. Earlier failures and source-bound receipts remain preserved. The separate spelling/private-memory/real-extension continuation still requires its own hosted result; no full capability or master gate is promoted by these bounded fixtures.

The inventory retains all **183 capability records and 112 source records**. These are discovered records, not a scope limit. The complete union and configuration audit remains open. Direct inspection of installed Windows browsers has not occurred.

[Method and historical findings](browser-capabilities.md) · [Historical native fixture checkpoint](browser-capabilities.md#verified-native-fixture-checkpoint) · [Current extension architecture](browser/EXTENSION-ARCHITECTURE.md) · [Canonical local data contracts](browser/HISTORY-BOOKMARKS-WORKSPACES.md) · [Canonical JSON](../browser/capabilities.json) · [Master goal](browser/MASTER-GOAL.md)

## Current implementation awaiting native qualification

| Area | Implemented scope | Portable evidence and remaining limits |
| --- | --- | --- |
| Independent preferences | Home/custom search, dark/light/system appearance, accents/density, toolbar visibility, editable shortcuts and reviewed presets | [Preference contracts](../tests/preferences.test.cjs) and [production-renderer contracts](../tests/renderer-product.test.cjs); native pickers, layout/focus, international input and richer customization remain open. |
| History and bookmarks | Separate identity-owned canonical services, durable edits/deletes, explicit recovery, recording/retention, hierarchy/search and identity-bound drafts | [History](../tests/history.test.cjs), [bookmarks](../tests/bookmarks.test.cjs) and [DOM](../tests/renderer-product.test.cjs) contracts; native/package restart, scale and complete interchange remain open. |
| Workspaces and tab groups | Durable local definitions, saved membership, collapse/color and assignment without implicitly closing background tabs | [Workspace contracts](../tests/workspaces.test.cjs); native focus/restart, whole-group lifecycle and extension tabGroups remain open. |
| Browser controls | Pin/reorder, audible/mute metadata, find match controls, bounded saved origin zoom, print/PDF and visible-page capture | [State/preference contracts](../tests/preferences.test.cjs) and [drag/draft DOM contracts](../tests/renderer-product.test.cjs); actual sound/find/zoom/print behavior and OS output dialogs remain pending. |
| Resource samples | Explicit process CPU/memory/native-owner view with shared-process and missing-value caveats; no polling or limiter claims | [Resource contracts](../tests/resources.test.cjs); OS correlation, attribution completeness, observer overhead and whole-workload performance remain open. |
| Extension host bridge | Authenticated extension frames/observed workers, canonical tab/window/bookmark/history operations, host-filtered cookies, native menu models and toolbar actions; genuine Mozilla Promise adaptation | [Host-router contracts](../tests/extension-bridge.test.cjs), [actual-preload contracts](../tests/extension-preload.test.cjs) and [exact architecture/limits](browser/EXTENSION-ARCHITECTURE.md); new native fixture, real package corpus, MV3 wake/lifetime, optional grants and missing APIs remain open. |

Source and portable contracts establish these bounded implementations, not complete browser equivalence. All G001–G012 gates remain open.

## Searchable capability records

Search by capability ID or name. The application exposes the same JSON in its explicitly opened Capabilities panel.

| ID | Capability | Category | Current Noxviola status | Next action |
| --- | --- | --- | --- | --- |
| navigation-history | Address, search, back and forward | navigation | implemented-unverified | Verify forward-branch replacement, interrupted-load/error UI and per-tab navigation-history restoration; extend beyond generated loopback pages. |
| find-in-page | Find in page | navigation | implemented-unverified | Run the new source against repeated and Unicode fixture text, next/previous traversal, Escape, tab changes and native focus; retain explicit match-count UI. |
| multi-window | Multiple browser windows | navigation | absent | Extend canonical session state with window records and tested tab transfers. |
| save-print-page | Save page and print/PDF | navigation | partial | Qualify real print cancellation and saved PDF/PNG output on both hosted platforms, then implement complete save-page and print-option workflows without implying output from source inspection. |
| default-browser-protocols | Default browser and protocol handling | navigation | absent | Define OS registration separately from safe navigation and per-origin protocol policy. |
| startup-home-search | Startup, home and search configuration | navigation | partial | Validate the configured home/custom-search workflow in the new native gate and add independent startup modes without discarding saved sessions. |
| web-app-installation | Installed web apps | navigation | absent | Evaluate engine-supported PWA hosting and OS integration without treating a shortcut as complete PWA support. |
| tab-lifecycle | Create, select, close and reopen tabs | tabs | partial | Exercise pin, reorder, background create, lazy native-ID translation and restart on the new source before adding bulk tab operations. |
| vertical-tabs | Vertical and horizontal tab layouts | tabs | implemented-unverified | Verify both layouts with keyboard navigation, scrolling, many long-title tabs, resize and actual WebContentsView bounds. |
| tab-search | Search tabs across windows | tabs | absent | Add local indexed search with explicit identity scope and no truncation. |
| tab-preview | Tab previews and resource hints | tabs | absent | Reuse throttled on-demand capture and expose an accessible text alternative. |
| tab-audio | Audible tab identification and mute | tabs | partial | Play separate fixture audio in two identities and verify per-tab mute, navigation, restart and indicators before adding site-wide policy. |
| tab-groups-manual | Named manual tab groups | tabs | partial | Verify workspace/group creation, assignment, collapse and restart through the production UI, then add missing group lifecycle and extension operations over the same canonical definitions. |
| tab-groups-firefox-local | Firefox local saved groups | tabs | partial | Verify workspace/group creation, assignment, collapse and restart through the production UI, then add missing group lifecycle and extension operations over the same canonical definitions. |
| tab-islands | Opera GX automatic tab islands | tabs | absent | Implement opener/context grouping as an optional policy on manual groups. |
| workspaces-local | Local workspaces | tabs | partial | Verify workspace/group creation, assignment, collapse and restart through the production UI, then add missing group lifecycle and extension operations over the same canonical definitions. |
| workspaces-edge-v2 | Edge current workspace variant | tabs | absent | Implement local task sets first; keep any remote sync optional. |
| workspaces-shared-legacy | Shared workspace collaboration (historical variant) | tabs | absent | Retain the useful historical requirement; research a separately consented collaboration adapter. |
| split-browser | Split browsing surfaces | tabs | partial | Qualify split keyboard/focus routing, independent pane permissions, resize/closure and restoration before adding layouts or larger splits. |
| session-recovery | Session preservation and explicit recovery | tabs | implemented-unverified | Exercise native crash/interrupted-save recovery, corrupt/future checkpoints, canceled recovery and failed close writes; preserve the passing normal-close/restart metadata workflow. |
| identity-partitions | Named isolated identities | identities | implemented-unverified | Qualify authenticated accounts, cross-origin frame permissions, redirected/remote roots and older engine/profile upgrades while preserving the proven same-engine store transition and original IDs. |
| profiles-complete | Full profile preferences and data | identities | partial | Qualify identity-bound history/bookmarks and drafts in the native UI, then specify and implement the remaining per-profile data/preferences without silently changing ownership. |
| private-browsing | Ephemeral private browsing | identities | absent | Add a distinct ephemeral identity policy; Electron extensions cannot simply load into in-memory sessions. |
| container-site-rules | Container site assignment rules | identities | absent | Add rule resolution over canonical identity routing; compare native containers and the Mozilla extension separately. |
| site-permission-prompts | Origin-scoped permission prompts | permissions | implemented-unverified | Exercise real main-frame/subframe media and notification requests, same-document and cross-document navigation, prompt cancellation, OS denial and both check/request handlers on the exact build. |
| device-permissions | USB, HID, serial and device selection | permissions | absent | Inventory Electron chooser APIs and OS dependencies before exposing device grants. |
| screen-share | Screen and window sharing | permissions | absent | Implement a supported display-media request path and live sharing indicator. |
| permission-audit | Permission review and reset | permissions | partial | Verify UI review/reset plus actual ongoing camera/microphone and notification behavior after revocation; design explicit unused-grant expiry without silent policy changes. |
| malicious-site-protection | Phishing and malicious-download protection | security | absent | Determine what protection the Electron build actually supplies; do not label Chromium rendering as Safe Browsing coverage. |
| tracking-protection | Configurable tracker protection | security | absent | Evaluate a maintained rules engine and design one shared request-routing service. |
| secure-dns | Encrypted DNS preferences | security | absent | Verify supported Electron resolver configuration and per-identity limits before UI claims. |
| https-only | HTTPS upgrades and secure-connection policy | security | absent | Add supported upgrade policy and an origin-specific warning flow. |
| security-dashboard | Local safety and privacy review | security | absent | Build the dashboard from real service states; never fabricate protected or current labels. |
| cookie-controls | First and third-party cookie controls | security | absent | Implement cookies through supported session policy with per-identity controls. |
| total-cookie-protection | Firefox-style top-level site partitioning | security | absent | Compare actual Chromium storage partition semantics; do not equate identity partitions with top-level site partitioning. |
| fingerprint-protection | Fingerprinting protection | security | absent | Define specific supported protections and resist claims of complete anonymity. |
| scareware-blocker | Local scareware detection | security | absent | Evaluate an auditable local detector and preserve full-screen accessibility. |
| enhanced-security-mode | Additional engine exploit mitigations | security | absent | Research supported engine switches and their tradeoffs; never expose decorative protection toggles. |
| telemetry-zero | Zero first-party telemetry | security | implemented-unverified | Audit code and runtime network behavior; retain security updates and user-requested traffic. |
| browser-update-verification | Verified browser updates | security | absent | Add a supported updater and publish accurate build/engine versions before general use. |
| favorites-library | Local favorites and reference library | library | implemented-unverified | Qualify all item types and complete search, real import/export picker interaction, stale or changed preview files and failed-write/recovery UI; preserve the passing metadata round-trip and restart fixture. |
| bookmark-tree | Bookmark folders and tags | library | partial | Qualify the shared tree and identity-bound forms in native/package runs, then add complete tag and import/export workflows using the same canonical store. |
| reading-list | Read-later tracking | library | absent | Add independent reading state and supported offline capture only when requested. |
| collections-legacy | Rich research collections (historical Edge variant) | library | partial | Improve the existing vault for rich references; record Edge Collections as retired from149. |
| pinboards | Visual pinboards | library | absent | Provide a board view of the existing vault rather than a second store. |
| history-manager | Searchable browsing history | library | partial | Verify committed-navigation recording, title updates, per-identity settings/deletion and restart in the new native workflow; add missing range controls and history interchange over the same store. |
| account-atlas | Metadata-only account atlas | library | implemented-unverified | Preserve the existing metadata boundary and separately evaluate credential-manager integration. |
| downloads-manager | Download lifecycle manager | productivity | partial | Exercise actual destination-picker cancellation, network interruption/terminal retry, durable history and restart of in-progress downloads. |
| import-browser-data | User-selected browser data migration | library | absent | Inventory source formats and supported APIs without copying cookies, tokens or confidential extension state. |
| sync-opt-in | Optional cross-device sync | library | absent | Define end-to-end data/security requirements and reuse a vetted sync protocol before adding a provider. |
| data-cleaner | Selective local data cleanup | security | absent | Implement precise scope and preview; never use indiscriminate cache deletion as a performance claim. |
| reader-mode | Distraction-reduced reading | accessibility | absent | Evaluate maintained reader extraction and retain original access on extraction failures. |
| read-aloud | Read aloud | accessibility | absent | Prefer disclosed local platform voices and on-demand speech integration. |
| zoom-font-colors | Zoom, fonts and contrast | accessibility | partial | Validate native origin/identity zoom restoration and readable focus at high zoom; add the independent font/text/color controls still missing. |
| keyboard-carets | Keyboard and caret navigation | accessibility | partial | Audit focus semantics and shortcut conflicts across chrome and page views. |
| live-captions | Local live captions | accessibility | absent | Evaluate supported local speech models and platform capture routes without weakening permissions. |
| live-caption-translation | Live caption translation | accessibility | absent | Separate local captioning from any remote translation service and disclose the boundary. |
| translation-local | Local page translation | productivity | absent | Evaluate Mozilla translation components and licenses before an adapter; keep model download opt-in. |
| translation-service | Provider-backed translation | productivity | absent | Offer distinct local and remote choices; service identity and consent must be visible. |
| pdf-read-edit | PDF viewing and editing | productivity | absent | Verify embedded PDF support then add only supported editing functions with correct output tests. |
| screenshot | Page screenshots | productivity | absent | Expose on-demand engine capture with review and explicit local save. |
| eyedropper | Page color picker | development | absent | Reuse engine/platform color picker with keyboard access. |
| devtools | Developer tools suite | development | absent | Wire explicit menu/shortcut access to engine tooling and document supported panels. |
| picture-in-picture | Floating video playback | media | absent | Use supported native video surfaces and test each reference variant independently. |
| mini-window | Floating page or region window | media | absent | Evaluate Firefox160 early Mini Window behavior and a reversible engine-backed implementation. |
| media-control-center | Cross-tab media controls | media | absent | Reuse the engine media-session lifecycle and publish incremental status. |
| drm-media | DRM-protected media compatibility | media | blocked | Audit Electron codec/DRM availability; retain explicit service/platform blockers. |
| cast-media | Media casting | media | absent | Confirm supported runtime discovery and casting APIs before advertising availability. |
| gx-volume | Per-tab volume amplification | media | absent | Evaluate a consented audio graph; expose real gain and quality cost rather than a decorative slider. |
| gx-equalizer | Per-tab audio equalizer | media | absent | Prototype a genuine tab-scoped DSP path and compare fidelity/latency before integration. |
| gx-rgx-enhancement | Image and video enhancement | media | absent | Evaluate an optional maintained filter pipeline with accessible bypass and no unverified quality claims. |
| toolbar-customization | Customizable toolbar and sidebar | customization | partial | Qualify saved visibility/density with native bounds and keyboard access, then add arrangement controls without hiding essential browser actions. |
| themes | Composable themes and colors | customization | partial | Render and operate the saved appearance combinations on both native platforms, then add independent font/asset modules with accessibility and provenance. |
| gx-mod-components | Composable GX-style mod components | customization | absent | Define a permissionless declarative mod schema and preserve licenses/provenance. |
| live-wallpaper | Optional animated wallpaper | customization | absent | Load wallpaper on demand with pause and accessibility policy. |
| custom-cursor | Custom cursor presentation | customization | absent | Use standard cursor roles with safe validated assets. |
| website-shaders | Optional webpage visual filters | customization | absent | Evaluate supported compositor paths and retain reversible per-site settings. |
| keyboard-sounds | Optional typing and browser sounds | customization | absent | Use local event feedback without observing private text content. |
| background-music | Adaptive background music | customization | absent | Use one optional audio service with explicit ducking and pause policy. |
| forced-dark-pages | Per-site forced dark appearance | customization | absent | Evaluate CSS/engine darkening without changing page semantics. |
| tab-emoji | Tab emoji labels | customization | absent | Add optional metadata to the tab model without replacing page titles for accessibility. |
| shortcut-customization | User-configurable keyboard shortcuts | customization | partial | Exercise custom and cleared bindings with native page focus and non-US/IME input, then integrate extension commands with the same conflict resolver. |
| mouse-gestures | Mouse and rocker gestures | customization | absent | Implement optional gesture recognition using the canonical commands. |
| panic-switch | Reversible privacy cover | customization | absent | Implement a reversible view/media state transaction with shortcut conflict handling. |
| history-replacement | Optional history replacement | security | absent | Retain this behavior as an opt-in target with reviewable data-loss semantics; do not execute it during audit. |
| memory-saver | Chrome-style tab deactivation | performance | absent | Implement only after reliable lifecycle state capture; distinguish deactivation from freezing. |
| sleeping-tabs | Edge-style sleeping tabs | performance | absent | Assess an actual supported freeze path; closing WebContents is not equivalent sleeping. |
| energy-saver | Battery-aware browser policy | performance | absent | Add platform power-state observation and explicit policies after measurement. |
| page-preloading | Optional predictive page loading | performance | absent | Keep prediction opt-in and local where possible; do not hide network/data costs. |
| performance-alerts | Resource issue alerts | performance | absent | Use an inexpensive on-demand monitor and explicit user-selected action. |
| resource-monitor | Browser and extension resource monitor | performance | partial | Compare explicit samples with the actual process tree on both platforms and measure overhead before adding controls or performance claims. |
| gx-ram-limiter | User-selected memory budget | performance | absent | Evaluate supported controls; do not masquerade tab destruction or content caps as a memory limit. |
| gx-cpu-limiter | User-selected CPU budget | performance | absent | Research OS-supported scheduling controls and disclose throughput/latency tradeoffs. |
| gx-network-limiter | User-selected network budget | performance | absent | Evaluate per-session throttling versus real whole-browser shaping; report scope accurately. |
| gx-hot-tabs | Identify and stop resource-heavy tabs | performance | absent | Tie monitor entries to stable tab IDs and avoid unsolicited termination. |
| gaming-policy | Optional gaming resource policy | performance | absent | Keep detection local and evaluate an explicit user-selected profile, not silent feature removal. |
| gx-corner | Optional gaming hub | optional-services | absent | Build an optional source adapter with local preference and no startup fetch. |
| game-release-calendar | Game release calendar | optional-services | absent | Use licensed source feeds and preserve uncertainty for changed release dates. |
| game-deals | Game deal aggregation | optional-services | absent | Evaluate lawful source APIs and optional local notification scheduling. |
| game-trailers | Game trailer discovery | optional-services | absent | Reuse the media panel with licensed sources and explicit playback. |
| browser-games | Browser game discovery | optional-services | absent | Reuse ordinary sandboxed web tabs with explicit discovery providers. |
| personal-news | Optional news feeds | optional-services | absent | Use an opt-in feed reader; avoid recommendation telemetry. |
| smart-home-panel | Optional smart-home panel | optional-services | absent | Investigate provider-supported APIs; do not imply access from a browser feature label. |
| music-sidebar | Shared music-service panel | optional-services | absent | Reuse an identity-scoped panel host and media-session controls. |
| messenger-sidebar | Shared messenger and social panel | optional-services | absent | Implement one optional panel service, then validate each provider separately. |
| flow-transfer | Optional cross-device transfer | optional-services | absent | Evaluate a consented encrypted transfer protocol rather than silently copying provider accounts. |
| panel-twitch | Twitch panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-discord | Discord panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-whatsapp | WhatsApp panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-telegram | Telegram panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-messenger | Messenger panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-instagram | Instagram panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-x | X panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-bluesky | Bluesky panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| panel-slack | Slack panel variant | optional-services | absent | Audit provider-specific embedding, permissions and terms before enabling this adapter. |
| music-spotify | Spotify music variant | optional-services | absent | Verify provider-supported playback and licensing; retain a blocker for unavailable native or DRM dependencies. |
| music-apple-music | Apple Music music variant | optional-services | absent | Verify provider-supported playback and licensing; retain a blocker for unavailable native or DRM dependencies. |
| music-youtube-music | YouTube Music music variant | optional-services | absent | Verify provider-supported playback and licensing; retain a blocker for unavailable native or DRM dependencies. |
| music-deezer | Deezer music variant | optional-services | absent | Verify provider-supported playback and licensing; retain a blocker for unavailable native or DRM dependencies. |
| music-tidal | Tidal music variant | optional-services | absent | Verify provider-supported playback and licensing; retain a blocker for unavailable native or DRM dependencies. |
| vpn-proxy-provider | Optional browser proxy/VPN provider | optional-services | absent | Evaluate an explicit provider adapter and privacy terms; do not relabel a proxy as universal anonymity. |
| ai-sidebar | Optional AI assistant panel | optional-services | absent | Use a provider-independent opt-in adapter and a preview of transmitted context. |
| ai-tab-actions | Reviewed natural-language tab actions | optional-services | absent | Route accepted actions through canonical tab/library commands; page text cannot grant authority. |
| ai-compare-tabs | Optional cross-tab comparison | optional-services | absent | Add an explicit multi-page context picker after permission and identity boundaries are proven. |
| ai-theme | Optional generated theme input | optional-services | absent | Keep image generation user-triggered and route output through the safe theme schema. |
| ai-image-service | Optional image creation service | optional-services | absent | Preserve as an opt-in integration goal; no image generation is performed by this audit. |
| ai-data-connections | Optional assistant data connections | optional-services | absent | Research provider-supported authorization without creating automatic account grants. |
| ai-memory | Optional assistant memory | optional-services | absent | Keep independent from browser history and require explicit data controls. |
| ai-vision | Optional visual page assistance | optional-services | absent | Gate capture on visible consent and source identity; do not start background screen analysis. |
| ai-controls | Unified optional-AI controls | customization | absent | Create a capability switch registry with explicit dependency handling. |
| visual-search | Optional visual search | optional-services | absent | Add provider selection with explicit payload review and safe results navigation. |
| autofill | Form autofill and credential-manager integration | productivity | absent | Evaluate established password-manager/OS integrations separately from the metadata-only account atlas. |
| passkeys | Passkey authentication | security | absent | Verify Electron WebAuthn/platform support and user verification before claiming passkey parity. |
| password-health | Optional password health checks | security | absent | Delegate to a vetted credential manager; never add plaintext passwords to the account atlas. |
| writing-assistance | Optional spelling and grammar assistance | productivity | absent | Reuse native spellcheck first; keep grammar providers independent and optional. |
| desktop-search-bar | Optional desktop search surface | productivity | absent | Expose the canonical search command through an optional OS surface after core navigation works. |
| mobile-upload | Optional phone-to-site upload | optional-services | absent | Research a supported secure transfer adapter and never auto-read mobile files. |
| history-journeys | Related-history organization | productivity | absent | Evaluate local grouping over the canonical history store without sending browsing data to a service. |
| extension-package-inspection | Package and manifest inspection | extensions | partial | Implement qualified CRX verification and Mozilla trust evaluation as distinct adapters; test native execution of the unchanged accepted package. |
| extension-provenance | Package provenance and signatures | extensions | partial | Qualify separate CRX and XPI trust chains; retain explicit unsigned local-import consent and source provenance. |
| extension-lifecycle | Persistent extension lifecycle | extensions | partial | Qualify representative real packages, verified updates/rollback and explicit data-erasure behavior while retaining the passing generated install/restart/disable/uninstall workflows. |
| extension-marketplaces | Unified source discovery and acquisition | extensions | absent | Keep store adapters separate from runtime compatibility and respect documented distribution restrictions. |
| extension-migration | User-authorized extension migration | extensions | absent | Start with manifest/ID/version discovery and explicit unsupported-settings reporting. |
| extension-manifest-v2 | Manifest V2 compatibility | extensions | partial | Expand beyond the persistent fixture to lazy/event pages, UI contexts and pinned real MV2 packages; compare Firefox separately and retain version/distribution provenance. |
| extension-manifest-v3 | Manifest V3 compatibility | extensions | partial | Run an actual pinned-runtime MV3 worker lifecycle fixture; portable worker-object checks and content-only package passes cannot qualify background behavior. |
| extension-namespaces | Namespace and async-call adaptation | extensions | partial | Run the new native bridge fixture and pinned upstream packages against callback and Promise behavior before adding further namespace/member support. |
| extension-messaging | Extension messaging and event routing | extensions | partial | Run native one-shot/Port and both-direction ID translation workflows with revocation and restart, retaining earlier scoped MV2 receipts. |
| extension-content-scripts | Content scripts and execution worlds | extensions | partial | Verify absence of the new transport in webpages and content worlds, then qualify native injection and required browser-specific world semantics. |
| extension-actions | Toolbar and page actions | extensions | partial | Verify action controls and popup/click behavior in the native bridge fixture, then implement remaining icon/pageAction and accessibility contracts. |
| extension-sidepanels | Chrome sidePanel behavior | extensions | absent | Add a panel host tied to the extension service after required API semantics are qualified. |
| extension-firefox-sidebar | Firefox sidebarAction behavior | extensions | absent | Adapt the shared panel host while preserving Firefox-specific API behavior. |
| extension-tabs-api | Complete required tabs members | extensions | partial | Qualify real tab mutations/events, lazy/native ID translation, identity denial and cleanup using the new native bridge fixture, then implement the remaining members. |
| extension-windows-api | Required windows members | extensions | partial | Verify the real single-window subset natively, then extend the canonical window/session model before exposing complete windows APIs. |
| extension-tab-groups | Extension tab group semantics | extensions | absent | Adapt tabGroups to the existing canonical group definitions after native UI/group acceptance; do not create a second extension-only group store. |
| extension-containers | Firefox contextualIdentities semantics | extensions | absent | Define an explicit mapping to Noxviola identity partitions; do not expose a fake cookieStoreId field. |
| extension-bookmarks | Extension bookmark tree | extensions | partial | Exercise durable bookmark mutation/event/readback and denial in the native fixture, then qualify real packages and remaining tree/field edge cases. |
| extension-history | Extension history API | extensions | partial | Qualify the actual native history bridge and per-identity events, including paused recording, partial visit deletion and restart. |
| extension-cookies | Extension cookie API | extensions | partial | Run native host-filtered method/event and cross-identity denial tests, then implement remaining cookie fields and selection semantics without broadening grants. |
| extension-storage | Extension storage areas | extensions | partial | Use the exact44.11.3 source documentation: local is documented; sync and managed are explicitly unsupported. Latest-site descriptions differ. Qualify additional areas and never label local-only storage as cloud sync. |
| extension-downloads | Extension download control | extensions | absent | Bind to the canonical download manager, with filename/path/permission enforcement. |
| extension-webnavigation | Frame navigation events | extensions | absent | Use supported runtime events and explicitly record any iframe gaps in adapters. |
| extension-webrequest | Request observation and interception | extensions | partial | Design one canonical request-policy owner. Electron application webRequest handlers take precedence over extension handlers; verify their composition with actual extension filters before enabling browser-owned filtering. |
| extension-dnr | Declarative request filtering | extensions | absent | Audit actual native DNR support; a webRequest name shim is not equivalent. |
| extension-userscripts | User-script runtime | extensions | absent | Keep Firefox legacy and modern userScripts variants distinct; use engine worlds and reviewed adapters. |
| extension-commands | Extension keyboard commands | extensions | absent | Share the canonical shortcut registry while preserving extension command semantics. |
| extension-context-menus | Extension context menu items | extensions | partial | Exercise the actual native menu controls and click payloads; extend unsupported contexts only with explicit semantic tests. |
| extension-notifications | Extension notifications | extensions | absent | Use OS notifications with scoped extension identity and user control. |
| extension-permissions | Runtime extension permission management | extensions | partial | Qualify native principal, host and revocation boundaries before implementing optional grants with explicit consent and durable scope changes. |
| extension-native-messaging | Native messaging adapters | extensions | absent | Retain native platform blockers; compare Chrome/Firefox/Apple host contracts before implementation. |
| extension-devtools | Developer-tools extensions | extensions | partial | Use Electron's documented DevTools path and independently qualify each required API. |
| extension-alarms | Extension alarms and background scheduling | extensions | absent | Preserve extension background lifetimes and wake events. The maintained adapter is a source candidate, not an adopted or verified service-worker implementation. |
| extension-offscreen | MV3 offscreen documents | extensions | absent | Determine whether the host truly supports offscreen documents before accepting dependent packages. |
| extension-oauth | Extension identity and OAuth | extensions | absent | Separate portable web auth flow from proprietary browser-account token APIs. |
| extension-proxy | Extension proxy configuration | extensions | absent | Preserve Firefox request-callback versus Chrome configuration semantics; use one canonical policy owner. |
| extension-settings | Extension browser/content settings | extensions | absent | Centralize settings ownership; never return successful no-ops for unsupported settings. |
| extension-browsing-data | Extension browsing-data removal | extensions | absent | Reuse the browser data-cleaning transaction and enforce exact API semantics. |
| extension-sessions | Extension session restoration | extensions | absent | Unify with browser recovery/closed-tab state rather than creating a second session list. |
| extension-reading-list | Extension reading-list API | extensions | absent | Build on a shared local reading-list service. |
| extension-debugger | Extension debugger access | extensions | absent | Evaluate supported native debugging transport and dangerous capability consent. |
| extension-screen-capture | Extension screen/tab capture | extensions | absent | Use the same permission/chooser service as website capture and keep source-specific API differences. |
| extension-resources | Extension resources and CSP | extensions | partial | Qualify actual engine behavior; CEF's reported dynamic-URL regression is a comparative test, not a solved fact. |
| extension-safari-portability | Safari portable payload versus native app | extensions | absent | Do not claim a macOS/iOS executable runs on Windows; report its exact required native component. |
| extension-resource-monitor | Per-extension resource and activity view | extensions | partial | Compare explicit samples with the actual process tree on both platforms and measure overhead before adding controls or performance claims. |

## Discovery queues

The canonical JSON retains every namespace discovered in the MDN and Chrome API indexes. A namespace entry is a work item, not a claim of member-level coverage. Browser settings, flags, policies, service-dependent and historical variants remain additional discovery work.

## Evidence rule

`implemented-unverified` means source exists and the declared end-to-end contract is still unproven. `partial` preserves missing behavior. Native permission/media, identity isolation, extension functionality, privacy traffic and whole-workload performance cannot be accepted through Node contract tests alone. All G001–G012 acceptance gates remain open.
