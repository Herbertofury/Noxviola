# NOXVIOLA: THE ULTIMATE UNIVERSAL BROWSER
## Master Development Directive: Feature Supremacy, Universal Extensions, Zero Bloat, Zero Telemetry

**Repository:** https://github.com/Herbertofury/Noxviola  
**Current PR:** https://github.com/Herbertofury/Noxviola/pull/5  
**Development branch:** `browser/enderloom-baseline-20261115`

# 1. THE ABSOLUTE PRODUCT VISION

**THE BEST OF EVERY BROWSER. BETTER THAN EVERY BROWSER. NONE OF THEIR BLOAT, TELEMETRY, OR UNNECESSARY RESTRICTIONS.**

Noxviola must become a comprehensive, exceptionally fast, fully configurable, privacy-first browser that eliminates the need to use multiple competing browsers.

Its primary mission is to combine and surpass the capabilities of:

- Opera GX
- Google Chrome
- Mozilla Firefox
- Microsoft Edge

Additionally, Noxviola must provide **universal cross-browser extension compatibility**, allowing users to install and use extensions developed for different browser ecosystems through one unified system.

## The six non-negotiable product goals

1. **TOTAL FEATURE SUPREMACY:** Offer the combined applicable functionality of all four reference browsers, preserving their unique capabilities while improving their limitations.

2. **UNIVERSAL EXTENSIONS:** Support extensions from different browser ecosystems through automatic compatibility adaptation, without requiring ordinary users to rewrite extension code.

3. **COMPLETE CUSTOMIZATION:** Let users independently configure and combine features from competing browsers, rather than forcing them into predefined browser experiences.

4. **ZERO UNNECESSARY BLOAT:** Eliminate wasted resource consumption, redundant services, duplicated implementations, and forced background work without sacrificing useful capabilities.

5. **ZERO FIRST-PARTY TELEMETRY:** No hidden usage tracking, browsing analytics, advertising identifiers, unauthorized cloud uploads, or silent first-party data collection.

6. **EXCEPTIONAL PERFORMANCE:** Deliver responsive, stable, memory-efficient browsing through measured architectural improvements.

**The number-one objective is maximum useful capability with minimum unnecessary overhead and complete user control.**

A feature-rich browser is not automatically bloated. Poor engineering, redundant work, and unnecessary background activity create bloat.

Never remove user-requested capabilities merely to improve benchmarks.

---

# 2. CONTINUE THE EXISTING PROJECT

## [ ] T001 — Resume development from PR #5

Do not restart Noxviola or discard existing work.

The existing experimental Electron baseline already includes:

- Electron and Chromium.
- `WebContentsView` tabs.
- Named browser identities with persistent sessions.
- Navigation and split browsing.
- Session restoration.
- Local favorites/media-reference vault.
- Metadata-only account atlas.
- Preview packaging and automated contract tests.

Prior review established that Node tests and preview packaging passed, but native GUI behavior, real browsing compatibility, session isolation, and performance remained insufficiently verified.

Recheck current branch state once and resume from the latest valid checkpoint.

Preserve existing functionality, state formats, recovery behavior, security boundaries, provenance, and project history.

Do not merge PR #5 or modify the separately held PR #4 without the required authorization.

**First make the existing Electron browser genuinely usable. Then continuously expand its capabilities.**

---

# 3. COMPLETE FOUR-BROWSER CAPABILITY AUDIT

## [ ] T002 — Directly inspect installed browsers

Opera GX, Chrome, Firefox, and Edge are already installed on the user's Windows 11 computer.

When supported local-computer access is available, directly inspect their:

- Executables and installed versions.
- Interfaces and settings.
- Tab, window, and workspace systems.
- Sidebars, panels, and toolbars.
- Navigation, shortcuts, and gestures.
- Gaming and media features.
- Productivity tools.
- Privacy and security settings.
- Extension systems and management interfaces.
- Developer tools and advanced options.
- Browser-specific features.
- Experimental and configurable capabilities.

Use fresh synthetic test profiles wherever possible. Do not modify private profiles or extract sensitive browsing data without authorization.

Supplement local inspection with official documentation, current stable-release information, changelogs, and appropriate source implementations.

If local access is unavailable, begin from verifiable documentation while keeping direct inspection unresolved.

## [ ] T003 — Maintain one exhaustive capability matrix

Create a persistent, searchable inventory covering the complete union of the four browsers' features.

Every feature must have:

- Name and actual behavior.
- Source browser and version.
- Full relevant configuration options.
- Compatibility and dependencies.
- Noxviola implementation status.
- Code ownership and integration strategy.
- Performance and privacy implications.
- Acceptance tests and evidence.
- Improvement opportunities.
- Next implementation action.

No arbitrary feature inventory caps.

Do not mark partial functionality as complete.

Record browser-specific variants separately when their different behaviors matter.

**The complete combined feature set is the target, not merely the capabilities all four browsers share.**

---

# 4. FLAGSHIP PREMIUM FEATURE: NOXVIOLA UNIVERSAL EXTENSION ENGINE

## [ ] T004 — Build genuine cross-browser extension compatibility

**THIS IS A TOP-PRIORITY PRODUCT REQUIREMENT.**

Noxviola must aim to support extensions from every major browser ecosystem, regardless of which browser the extension was originally written for.

Target:

- Chrome Web Store extensions.
- Firefox Add-ons.
- Microsoft Edge Add-ons.
- Opera and Opera GX extensions.
- Compatible Safari WebExtensions.
- Standard WebExtensions distributed outside official stores.
- Locally supplied extension packages.
- Unpacked developer extensions.
- Other relevant browser extension ecosystems discovered through research.

**The user should not need to switch to Firefox to run a Firefox extension, or Chrome to run a Chrome extension.**

The goal is for the extension to run naturally in Noxviola without requiring the user to modify its source.

### The user experience

A user should be able to:

1. Find an extension through its source marketplace or a unified Noxviola extension interface.
2. Select Install in Noxviola.
3. Have Noxviola inspect its manifest, format, permissions, dependencies, and required APIs.
4. Automatically resolve supported compatibility differences.
5. Review appropriate permissions.
6. Install and activate the extension.
7. Use its complete intended functionality.
8. Receive supported updates automatically, according to user preferences.
9. Enable, disable, configure, or uninstall it without compromising other extensions.

**Installation alone does not count as compatibility. The extension's real functionality must work.**

Do not disguise an unsupported extension as successfully installed.

## [ ] T005 — Build a real compatibility runtime

Electron's built-in extension system is incomplete and cannot independently satisfy this requirement.

Do not assume `session.extensions.loadExtension()` provides full Chrome extension compatibility.

Investigate established cross-browser extension runtimes and Chromium extension-hosting implementations before inventing a weaker replacement.

Build or integrate the missing capabilities through appropriate native extension APIs, compatibility layers, adapters, and runtime services.

Support relevant differences involving:

- `chrome.*` and `browser.*` APIs.
- Promise-based and callback-based functions.
- Manifest V2 and Manifest V3.
- Background pages, event pages, and extension service workers.
- Extension messaging and events.
- Content scripts and execution worlds.
- Extension popup windows.
- Browser and page actions.
- Side panels and sidebars.
- Browser tabs, windows, groups, and contextual identities.
- Bookmarks and history.
- Cookies and storage.
- Downloads.
- Web navigation.
- Request interception and filtering.
- `webRequest` and `declarativeNetRequest`.
- Scripting and user-script injection.
- Browser commands and keyboard shortcuts.
- Context menus.
- Notifications.
- Permissions and host permissions.
- Native messaging.
- Developer-tools extensions.
- Browser-specific extension functionality.
- Other APIs and lifecycle behaviors discovered through real extension testing.

**Implement actual semantics, not superficial API names or no-op compatibility shims.**

Where Chrome and Firefox implement an API differently, provide the behavior expected by the specific extension.

Where browsers provide proprietary extension APIs, implement an appropriate compatible service when technically feasible.

If a capability is impossible within Electron's extension runtime, investigate a more capable extension-hosting architecture or targeted browser-engine integration.

Do not immediately rewrite the entire browser because one extension API is missing.

When a package includes platform-specific native components, distinguish portable WebExtension functionality from native executable dependencies. Provide an appropriate supported integration or retain an explicit blocker rather than pretending Windows can execute incompatible native code.

### Extension compatibility architecture

Prefer a canonical extension-management service with:

- Package and manifest inspection.
- Source-format adapters.
- API compatibility dispatch.
- Per-extension runtime contexts.
- Permission enforcement.
- Persistent extension lifecycle management.
- Secure extension-to-browser messaging.
- Extension settings and storage.
- Store/update integration adapters.
- Version-aware compatibility metadata.
- Diagnostics and regression testing.

Preserve stable extension identities and state across restarts and updates.

Prevent duplicate extension runtime instances and competing API handlers.

## [ ] T006 — Unified extension stores and installation

Create a polished **Noxviola Extensions** interface.

Allow users to discover extensions from supported sources without needing to understand browser-specific packaging formats.

Provide:

- Search and source filtering.
- Extension descriptions and supported capabilities.
- Clear publisher and source provenance.
- Permission disclosure.
- Installation and update controls.
- Version and compatibility information.
- Optional update notifications.
- Uninstall and data-removal controls.
- Extension-specific settings.
- A clear indication when a requested API is unsupported.
- Import of supported extensions from locally installed browsers.

Support relevant package formats, including CRX, XPI, ZIP, and unpacked WebExtensions, through verified parsing and packaging adapters.

Do not assume different package formats have interchangeable trust or signature semantics.

Keep downloaded package validation, provenance, manifest inspection, and update verification explicit.

Do not silently bypass store authentication, distribution restrictions, or signature verification.

If direct marketplace installation is technically unavailable, implement a safe supported acquisition method or identify the specific unresolved restriction.

## [ ] T007 — Extension migration and configuration

Allow users to bring their existing extension setup into Noxviola.

Where source-browser access and formats permit:

- Discover installed extension metadata.
- Recognize extension identity and version.
- Identify the original distribution source.
- Match equivalent releases across browser marketplaces.
- Install supported versions into Noxviola.
- Import extension configuration through supported, user-authorized mechanisms.
- Preserve user choices and extension state across browser restarts.

Never silently copy browser credentials, cookies, authentication tokens, or confidential extension data.

Do not modify or damage the original browser installation.

When extension settings cannot safely be migrated, install the extension while accurately reporting which settings require manual reconfiguration.

### Per-identity extension management

Allow a user to choose whether an extension is enabled:

- Globally.
- For selected browser identities.
- For selected workspaces.
- For specified websites, subject to permissions.
- Temporarily for a browsing session.

Preserve real isolation between browser identities and extension data.

An extension must not silently gain access to another identity's cookies, account sessions, or site permissions.

## [ ] T008 — Extension performance and zero bloat

**Universal extension compatibility must not turn Noxviola into an inefficient browser.**

Design the extension system for:

- On-demand initialization.
- Event-driven background processing.
- Efficient message routing.
- Shared infrastructure rather than redundant services.
- Isolated extension faults.
- Cleanup when extensions are disabled or uninstalled.
- Accurate visibility into CPU, RAM, and activity.
- Predictable extension startup behavior.
- Minimal idle resource consumption.
- Efficient operation with large installed extension libraries.

Avoid arbitrary limits on installed extensions.

Do not artificially terminate necessary extension operations or change API semantics to improve resource measurements.

Provide a clear extension resource monitor showing which installed extensions consume significant resources.

Keep optional monitoring inexpensive and privacy-preserving.

**Disabled extensions should not run background code or consume unnecessary ongoing resources.**

## [ ] T009 — Cross-browser extension compatibility testing

Build a reusable test matrix for real extensions from each target ecosystem.

Test representative classes, including:

- Ad blockers and privacy extensions.
- Dark-mode and theme extensions.
- Password-manager integrations using synthetic test credentials.
- Userscript managers.
- Download managers.
- Tab and workspace managers.
- Productivity and sidebar extensions.
- Media-control extensions.
- Developer-tools extensions.
- Firefox-specific container-aware extensions.
- Extensions using browser-specific APIs.
- Extensions using Manifest V2 and V3.

For each extension, verify:

- Installation.
- Permissions.
- Initialization.
- UI rendering.
- Content-script behavior.
- Required APIs.
- Persistent storage.
- Background behavior.
- Real website interaction.
- Cross-identity behavior.
- Updates and removal.
- Performance and resource use.
- Security isolation.
- Restart recovery.

Record exact versions, source packages, required APIs, test results, and known limitations.

Build regression tests from incompatibilities.

**A working extension popup without functional content scripts or background processing is a failed compatibility test.**

### Universal compatibility acceptance

The long-term objective is to run every technically portable supported extension from the targeted ecosystems with its intended functionality intact.

For extensions dependent on unavailable proprietary or platform-specific systems:

1. Identify the exact dependency.
2. Determine whether an adapter can provide equivalent behavior.
3. Investigate a safe, more capable runtime when necessary.
4. Implement a functional alternative where feasible.
5. Preserve genuinely unresolved cases rather than marking them successful.

**Never reduce the universal-extension goal to a small allowlist of handpicked extensions.**

Extensive feature support, not artificial compatibility statistics, defines success.

---

# 5. TOTAL CUSTOMIZATION AND FEATURE INTEROPERABILITY

## [ ] T010 — Make every useful capability configurable

Users must be able to mix:

- Firefox-style containers and customization.
- Opera GX-style gaming and resource controls.
- Edge-style productivity tools and split browsing.
- Chrome-style browser and extension workflows.
- Noxviola's improved alternatives.
- Cross-browser extensions installed through the Universal Extension Engine.

All within one coherent interface.

Support configurable layouts, toolbars, sidebars, shortcuts, tab behavior, profiles, themes, optional functionality, settings, and reusable presets.

The user's chosen interface must not restrict which extension ecosystem they can use.

Do not introduce mutually exclusive browser modes simply because the source browsers implement their features differently.

Share canonical services while allowing different UI presentations.

---

# 6. ZERO BLOAT, ZERO TELEMETRY

## [ ] T011 — Build a feature-rich but exceptionally lean browser

Optimize real full-process resource consumption.

Remove:

- Redundant background workers.
- Unnecessary startup operations.
- Duplicated service implementations.
- Excessive IPC and UI refreshes.
- Unused bundled services.
- Wasteful extension polling.
- Unnecessary memory retention.
- Inefficient cache handling.
- Forced integrations that the user does not want.

Maintain complete feature availability.

An optional feature may initialize when needed rather than always running.

Measure cold/warm startup, tab switching, interaction latency, long-session stability, CPU, RAM, disk, network, and total footprint.

**Make the browser faster by doing the same complete work more efficiently, never by silently doing less.**

## [ ] T012 — Enforce zero Noxviola-owned telemetry

Do not implement first-party behavioral tracking, usage analytics, unique tracking identifiers, silent crash uploads, advertising telemetry, or undisclosed browsing-data transmission.

Inspect Electron/Chromium network behavior and identify optional upstream services and diagnostics.

Disable unnecessary vendor reporting through safe supported mechanisms.

Do not disable necessary browser security functionality merely to suppress network traffic.

Keep diagnostics local by default.

Provide explicit consent and configuration for genuinely optional network services.

Apply the same privacy standards to extension management and marketplace adapters.

Noxviola must not collect an inventory of installed extensions or transmit extension-use analytics to its own servers.

Verify privacy promises with controlled network tests rather than relying on configuration alone.

---

# 7. ELECTRON FIRST, RUST ONLY WHEN OBJECTIVELY BETTER

## [ ] T013 — Preserve the working Electron foundation

Start with the existing Electron + Chromium implementation.

Its first priority is to function as a real browser with reliable navigation, sessions, identities, downloads, media, and extensions.

Do not begin a complete Rust rewrite while those workflows are unfinished.

## [ ] T014 — Evaluate better architecture through real evidence

Optimize Electron first.

Investigate Rust for storage, indexing, native services, background operations, or the application shell only when it offers measurable improvements.

Extension compatibility is an additional architectural evaluation criterion.

If Electron's built-in extension limitations prevent the universal-extension goal, investigate more complete Chromium extension runtimes, engine integrations, and compatible embedding architectures.

The ideal solution may be Electron, a hybrid architecture, or eventually a more native browser.

A full migration toward Rust is acceptable only when demonstrated to improve overall performance **and** overall browser capability while preserving security, compatibility, customization, and existing data.

Do not pretend a Chromium/WebView2-backed browser has a Rust-native rendering engine.

**The fastest and most capable complete browser wins. Programming language purity never wins over functionality.**

---

# 8. EXECUTION ORDER

## [ ] T015 — Continue implementation immediately

Use this priority order:

**P0 — Actual browser functionality:** Launch Noxviola, exercise real websites, fix critical bugs, validate session persistence, and establish a usable native build.

**P1 — Universal Extension Engine:** Establish an end-to-end extension installation and execution path, then expand actual API compatibility across browser ecosystems.

**P2 — Complete Four-Browser Parity:** Implement the combined capability inventory discovered from Opera GX, Chrome, Firefox, and Edge.

**P3 — Full Customization:** Let users combine all supported features and extensions without conflicting UI, state, or settings.

**P4 — Privacy and Zero-Loss Optimization:** Remove unnecessary resource consumption and vendor telemetry while preserving complete functionality.

**P5 — Evidence-Driven Native Improvements:** Adopt Rust or alternative engine infrastructure only when genuinely superior.

These are scheduling priorities, not permission to discard any accepted scope.

Work through dependency-ready implementation tasks rather than repeatedly replanning.

Use independent subagents when supported, without conflicting source modifications.

For substantial changes:

**Implement → Targeted Test → Real Runtime Verification → Resource/Privacy Validation → Source Checkpoint → Next Task**

Keep the development branch, PR, and project documentation synchronized at verified checkpoints without bypassing review requirements.

Preserve all accepted requirements, source provenance, historical decisions, test evidence, and exact continuation state.

Do not generate images without explicit authorization.

---

# 8A. FLAGSHIP FEATURE: NATIVE AI ORCHESTRATION COMMAND CENTER

Owner direction, 2026-11-25. This is a first-class Noxviola product pillar, not merely a chatbot, sidebar wrapper, extension bundle or external API client. Make the browser the command center for **all web-based AI work**, including many independent tasks and cooperating teams of real provider chats. Remove the burden of opening, configuring, assigning, watching, recovering and manually coordinating dozens of tabs. Users retain control of their own provider accounts, plans, model settings, permissions and work.

This section is the living implementation prompt for this feature. Extend the same directive and stable milestones as new owner requests arrive. Reconcile existing requirements and implementation before adding new ones; never delete, duplicate or mark them complete without evidence. This is additive to the existing browser goals, not permission to pause or remove them.

## [ ] T016 — Native Constellation parity and architecture

Inventory the actual current [Project Constellation source](https://github.com/Herbertofury/Project-Constellation), [feature documentation](https://github.com/Herbertofury/Project-Constellation/blob/main/docs/FEATURES.md), [provider support](https://github.com/Herbertofury/Project-Constellation/blob/main/docs/PROVIDERS.md) and relevant Commander local-tool/control-plane capabilities. Track each real feature, source revision, current Noxviola equivalent, portability, shared owner, dependencies, parity evidence and open gaps. Preserve and adapt proven code, protocols, provider contracts, tests and recovery knowledge rather than rebuilding weaker equivalents. Audit current PR #5 tab/workspace, multi-pane, identity, session, sidebar, permission and storage owners; integrate the orchestration layer natively through these owners and one canonical job/event/store service, not duplicate schedulers, tab controllers or hidden extension layers. Existing standalone Constellation remains independent; do not require it to be installed or retire its source. Provide a local-first, optional import/migration with provenance, conflict resolution and no secret export. Electron first; replace hot paths with Rust only with equivalent functionality, compatibility and measured gains.

## [ ] T017 — Universal provider and model-aware job launcher

From the native command center, launch individual jobs, a batch of unrelated prompts, or one parent objective delegated into cooperating child jobs. Allow manual assignment or an optional editable decomposition/dispatch plan. Open or reuse actual provider chat tabs, optionally within named projects, workspaces, tab groups, split panes or separate windows; associate stable job/attempt/conversation IDs. Support user-configured templates, per-job instructions, context/files, explicit model and effort choices, provider, browser identity, account, priority, dependencies, and user-defined concurrency. First prove real ChatGPT sessions with the user's available Extra High and Pro options, as well as other selected models/modes. Discover and verify what the provider actually exposes for that signed-in account; distinguish requested model from observed selected model and never silently downgrade. Support choosing existing conversations or a new chat, bulk editing, saved worker/team presets, one-click launches, manual composer fallback and direct access to exact conversation URLs. Never overwrite nonempty drafts or duplicate a possibly submitted prompt. Reconcile submission and provider identity before retry; surface unavailability, quota/reset, auth or model mismatch and allow user choice rather than bypassing plan access, rate limits, CAPTCHA, MFA or service restrictions.

Expand systematically to web AI providers documented by Constellation and other user-selected providers, with an extensible capability matrix and adapter contracts for launch, model selection, composer, attachments, observation, output, approval and recovery. Reuse authorized browser sessions; use official interfaces when applicable. An external API key, per-token API transport or separately billed service must not be necessary for browser-session workflows. Do not claim universal parity when a provider does not expose a capability. Keep credential/token handling within the relevant protected browser/session boundary.

### Launch recipe and agent fleet controls · owner clarification

Make the primary workflow exceptionally simple: choose a web AI site (ChatGPT, DeepSeek, Claude, Gemini, Grok, or another configured service), select the signed-in browser identity/account, choose the actual available model and reasoning effort (for example, GPT-6.2 Extra High or GPT-6 Pro when offered), select one or multiple agents, enter the objective or individual prompts, and launch. No need to pre-open or manually configure tabs. Support a repeatable single-task fan-out, one objective split among specialists, and a batch of unrelated tasks; let the user choose the mode and agent count. Per-agent provider/model/effort, individual instructions, project/context and role may override fleet defaults. Provide reusable launch recipes and team presets, quick duplication, attach existing chats, drag/drop assignment and an editable queue; display requested versus verified actual selections before dispatch and thereafter. The browser may arrange real chats in native groups/panes or keep them in background tabs without switching the user's focus. Respect provider access, account selection, usage restrictions and backpressure; show exactly which agent is blocked or awaiting a slot instead of silently changing its model or losing queued work. Model labels and capabilities must come from the provider's current supported interface, not hardcoded assumptions.

## [ ] T018 — Multi-agent teams and dependency orchestration

Provide a visual and editable job graph and straightforward queue/list for single tasks and complex projects. Support parallel fan-out, sequential dependencies, specialist roles (research, coding, review, QA, synthesis or user-defined), shared project context with explicit scope, structured handoffs and fan-in result aggregation. Let users assign or reassign work, change priorities/model presets, pause undispatched jobs, request supported cancellation, retry failed-only work, branch and continue, approve proposed steps, insert new tasks and resume an interrupted plan. Distinguish genuinely independent jobs from jobs modifying the same repository/files/environment; isolate workspaces/branches or serialize conflicting writes with explicit ownership, checkpoint and merge/review gates. Deduplicate jobs and side effects, use idempotent dispatch plus reconciliation, preserve independent successful results and never send downstream tasks until their required evidence is available. Parent progress is derived from actual child state, not optimistic timers. Include user-editable plans, a shared objective, decisions/evidence, source attribution, result comparison and a synthesis/reviewer lane that does not erase disagreements or claim unverified execution. Keep user-approved limits for active work, provider backpressure and scheduling; never bypass quotas with account rotation. No forced permanent global coordinator chat: direct manual batch dispatch and single-job operation remain first-class.

## [ ] T019 — Native live operations dashboard

Provide a polished, customizable AI workspace with overview, projects, jobs, active/queued/attention/completed/archived lanes, expandable job detail, task context, model/provider/profile badges, elapsed time, actual observed progress and tool/activity history, exact tab focus/jump, bulk actions, search/filter/sort, keyboard navigation and configurable layout. Native tab status indicators/favicons, job counts, tab groups, split panes, sidebar and optional compact overlay all read the same state; never steal focus or user-created groups. Manage already-open and newly launched chats independently, foreground or background, and support attaching/detaching existing chats. Distinguish idle, queued, submitted, generating, quiet, tool-running (when observable), approval-needed, auth-required, rate-limited, stalled, disconnected, failed, canceled, completed and unknown/unverified states. Explain why a job needs attention, surface the last real activity and confidence/provenance, and never infer hidden chain-of-thought, claim invisible work is active, or equate a provider page refresh with completion. User-configurable notifications and focus-free background supervision apply only to explicitly enabled managed work; no unrelated always-on watchdog. Disabled orchestration has no unnecessary ongoing workers.

## [ ] T020 — Project Brain, knowledge vault, output vault and continuity

Native Project Atlas/Brain and Knowledge Vault retain searchable chat histories, task objectives, decisions, project/repository/file/Drive/GitHub IDs and paths, links, evidence, citations, generated code/media/files/builds, follow-ups, artifacts and revision provenance. Preserve immutable richest assistant-output revisions, raw and rendered export, recovery from lost/truncated provider outputs, branch/parent-child lineage, pinned/ignored/restored knowledge, user annotations, and context checkpoints. Track capture completeness (mounted partial, full capture, import/export, etc.) and unknowns; no fake full capture. Support user-initiated comprehensive capture/export with provider-compatible access, local persistence and optional explicitly authorized verified Drive/GitHub sync of selected project records; keep secrets and personal content out of public repos. Select only relevant, user-scoped context for each job, preserve source references and the full canonical store, and avoid leaking conversations/files across identities or unrelated projects. Compare and consolidate outputs, export/copy/download complete retained artifacts and open their actual source conversations. Restart, browser crashes, provider refresh and new chat branches must retain durable state and exact next action.

## [ ] T021 — Reliability, approvals and recovery

Port and improve Constellation's Execution Pulse, Reliability Supervisor, Context Lens, Tab Beacons, Output Vault, explicit Branch & Continue, stale/dead-chat rescue, recovery receipts and permission UX. Detect stalls using evidence rather than a single timeout, respect provider backpressure, and distinguish slow but healthy work from dead or blocked work. Opt-in bounded retry/refresh only for eligible unfinished managed jobs with durable pre-action checkpoints, cooldowns and user controls; do not disturb finished/idle chats or nonempty drafts. Handle provider UI changes, ambiguous completion, disconnects, crashes, navigation, auth, quota, duplicate sends, lost events and approvals with honest states and targeted recovery. Do not repeat a possibly completed side effect without verifying it first. Expose pending approval cards in one inbox; default to user review, and permit only explicit, narrowly scoped permission presets for supported low-risk approvals. Never silently approve high-impact/destructive actions, access grants, purchases, credential disclosure, public publication, or policy escalation. Preserve per-conversation permission semantics and an auditable receipt of each user-authorized action. Offer emergency stop/lock, pause dispatch, cancel supported work and recover unfinished jobs without silently reopening canceled work.

### Approval Autopilot that actually works · owner clarification

The user's central pain point is having many real AI conversations working concurrently, then discovering they have spent long periods waiting for repetitive GitHub, Google Drive, cloud/browser-use, connected-app or tool permission dialogs. Treat reliable approval handling as a flagship acceptance requirement, not an optional decorative switch.

- Provide an obvious, persistent **Approval Autopilot** switch and a fleet-wide approval inbox. Make its active scope visible in the launcher, job detail, native tab indicators, and dashboard. Default to manual review until the user explicitly enables an approval policy. Offer convenient modes: manual; remember a supported conversation-level choice; automatically accept previously authorized routine connector/tool prompts within a chosen scope; and a one-click policy for all managed jobs' preapproved routine prompts. Allow per-provider, browser identity/account, connector, tool/action class, project and conversation overrides, and easy pause/revoke/emergency lock. Make the actual policy and exceptions inspectable. A user's explicit policy may eliminate repetitive confirmations within its granted scope; it must not silently authorize new accounts, data scopes or high-impact actions.
- Reuse Project Constellation's tested per-tab approval handler and supervision patterns. Build provider-specific adapters for current visible prompt forms, including ordinary Allow, Allow dropdowns, supported Always allow/Allow for this conversation choices, inline permission cards and tool-specific consent variants. Distinguish an already-authorized routine request from OAuth/account connection, credentials, MFA/CAPTCHA, a newly expanded permission grant, unknown dialog, external disclosure, destructive write, purchase or public publication. Surface the latter for explicit review; never defeat a provider-enforced mandatory confirmation or invent a universal permission bypass. Use the strongest supported persistent permission selection only when the user has chosen it and it is available. If not available, handle individual eligible repeated prompts without pretending the provider remembered the choice.
- Detect new and remounted eligible prompts independently in **every managed foreground or background chat**, including tabs opened after startup, backgrounded/minimized windows, restored sessions and SPA navigation. Use lightweight event-driven observers and a central lifecycle-aware coordinator, not focus-stealing, full-page polling or competing click handlers. Prioritize the approval event path even when a tab is quiet or throttled. Correlate stable job/attempt, provider origin, identity, conversation, current turn, connector, requested scope and prompt instance before acting. Reject stale or mismatched events, unknown labels, ambiguous controls and spoofed page content; never act on unrelated browsing tabs or simply click every button containing the word Allow.
- Permission handling is a transaction: detect -> classify -> check user policy -> invoke the provider's actual supported action in the correct tab -> verify the specific prompt clears and the intended scope/result is observed -> record a receipt -> observe continuation or surface a precise failure. A successful click alone is not proof of approval. If a new equivalent prompt appears, classify that specific instance; deduplicate re-renders and late events. On failure, use bounded retries only when evidence changes, stop on repeated ambiguity, preserve manual controls, and report auth, policy denial, provider restriction, or adapter breakage rather than silently leaving jobs stuck. Do not indiscriminately refresh or resend the user's task. Preserve open composer drafts, checkpoint before any enabled recovery and reconcile a possibly completed action before repeating it.
- Show detected/authorized/awaiting-user/confirmed/failed state, provider, connector/action scope, conversation, timestamps, last observable activity, pending duration, and redacted approval receipts. Notify the user only when their intervention is genuinely required (or according to their preference). Keep approval controls reachable in one click; support manual approve/deny for selected eligible requests and pause/resume the fleet. Never let an approval policy bypass the separate local-tool permission boundary. Store policy locally, preserve authorized settings across restart, and never export private credentials or sensitive consent payloads.
- Test the exact current Noxviola build against multiple authorized real provider chats where possible: a foreground and a background ChatGPT session using different selected model/effort presets, multiple routine connector cards, successive prompts, supported persistent-consent variants, one manually gated scope expansion, tab/window restoration, prompt re-render and failure/recovery. Include fixture coverage for provider variants, expired sessions, policy revocation, prompt spoofing, stale clicks, duplicate events and provider-mandated confirmations. Prove that eligible routine approvals are actually accepted, the correct job continues, rejected prompts remain pending, no other tab is affected, policy disable takes effect and no focus is stolen. Measure detection-to-confirmed-action latency and idle resource overhead across realistic concurrent workloads; record provider limitations and live versus fixture evidence. No mock toggles, click-only tests, unverified permission success or claimed universal approval support.

## [ ] T022 — Native Commander-style local tooling and secure controls

Where relevant to web AI orchestration, incorporate Constellation Commander's explicit local-tool mode, permission-enforced runtime, live activity, diagnostics, emergency lock, local manual tool console, and desktop/file/project controls. Capability-gate each operation; use a single production permission path, least privilege, workspace/path scope, sandboxing and strict IPC/origin validation. Website/AI output is untrusted data and cannot grant itself access, execute arbitrary local commands, read secrets or change the user-approved objective. High-impact side effects require explicit authorization. Separate user browser profiles, provider session credentials, sensitive captures and project boundaries; no first-party telemetry, no unauthorized remote uploads, no password/token extraction, no broad permission bypass. Make optional local-computer integration native where supported without requiring extra subscription or developer API transport, and clearly distinguish capabilities unavailable on the current platform.

## [ ] T023 — Zero-loss performance, QoL and provider compatibility

Keep the dashboard instantaneous and usable with large tab/job/project collections: event-driven state, per-tab isolated observation, coalesced change-only updates, cached local indexes, off-UI-thread heavy I/O and incremental reconciliation. Avoid polling storms, redundant provider requests, automatic tab focus, hidden duplicate browsers, idle workers and resource leaks. Use user/provider-aware active-job backpressure without discarding queued jobs, outputs, cards or capability. No arbitrary card/tab/job caps, viewport culling or degraded capture to fake speed; preserve full access and functionality. Expose per-job/tab resource usage and configurable controls. Measure cold/warm startup, typing, tab switching, scroll/input latency, CPU/RAM, active/idle background load, job-launch throughput and complete-result equivalence against the current browser and Constellation baseline under representative workloads. Maintain provider regression fixtures and real live-session qualification separately. Provide keyboard-accessible, responsive, polished dark-default UI with restrained optional motion/reduced-motion support, meaningful empty/error/loading states and one-click recovery/actions.

## [ ] T024 — Real multi-job acceptance and continuous expansion

Use a production-native vertical slice: launch multiple real authorized ChatGPT conversations in user-selected available effort/model modes (including Extra High and Pro where entitled), run independent tasks concurrently without stealing focus, and run a parent/child parallel-to-synthesis workflow with dependency enforcement and actual saved outputs. Exercise existing-chat attachment, prompt draft conflict, unavailable model, user cancellation, quota/backpressure, permission review, simulated and real provider failure, restart recovery, partial completion, stale state, duplicate prevention, cross-identity isolation, complete vault export and user-approved sync. Verify the exact packaged Windows build, visible and background tabs, UI controls, persistence, real provider state and complete artifacts; use synthetic tests for destructive/rate-limit scenarios and clearly label them. Verify performance with orchestration off/on at equivalent work; no feature loss or idle regression. Extend the same proven pattern across all technically supported web AI providers and every inventoried Constellation feature, with explicit unavailable/blocked capability records. Publish coherent checkpoints and keep the existing PR/merge holds intact. A dashboard mockup, passing build, provider tab opening, or a single successful chat is not multi-job acceptance.

### Owner workflow acceptance additions

- Demonstrate a saved ChatGPT launch recipe with the user's actual available Extra High and Pro modes, plus a supported DeepSeek or other web-provider recipe; launch one agent, then a user-selected multi-agent batch with mixed overrides. Verify exact actual provider, model/effort, account, prompt submission, independent status, real chat links and result capture.
- With an explicitly configured routine-approval policy, prove that supported GitHub/Drive/cloud-use permission prompts in multiple concurrently running chats are correctly detected, accepted and followed by observable continuation without manual tab switching. Demonstrate a nonempty draft, unknown/high-impact or expanded consent request that stays manual, a disabled/revoked policy, and an adapter failure that surfaces in the attention inbox. Record what could actually be verified on each provider. The user's everyday experience of no longer babysitting routine approvals is a release gate, not a settings-screen screenshot.

### AI orchestration milestone sequence (open)

- [ ] **AI-M1 — Native foundation:** T016; parity inventory, shared job/identity/state architecture and a real integrated job vertical slice.
- [ ] **AI-M2 — Real multi-chat launcher:** T017; selected models/effort, batch launch and exact session-aware dispatch.
- [ ] **AI-M3 — Multi-agent coordination and operations:** T018–T019; dependency graph, dashboard, native indicators and independent foreground/background operation.
- [ ] **AI-M4 — Durable project knowledge and recovery:** T020–T021; vaults, continuity, permissions, recovery and restart proof.
- [ ] **AI-M5 — Secure native tooling and zero-loss speed:** T022–T023; permission boundary, live controls, equivalent-work measurements and no idle waste.
- [ ] **AI-M6 — Release qualification and broad provider parity:** T024; real packaged-browser acceptance, honest capability matrix and verified rollout. Continue adding providers/capabilities and user requests after each verified milestone.

---

# 9. FINAL ACCEPTANCE GATES

- [ ] **G001 — Working Browser:** Real Noxviola application launches and performs actual desktop browsing reliably.

- [ ] **G002 — Complete Browser Audit:** All four reference-browser feature inventories are captured, versioned, and reconciled against official current releases.

- [ ] **G003 — Universal Extensions:** Extensions from the supported browser ecosystems install, execute, persist, update, and function through verified compatibility behavior.

- [ ] **G004 — Extension API Coverage:** Required manifest formats, WebExtension APIs, browser-specific semantics, and lifecycle behaviors have real acceptance evidence. No unsupported capability is misrepresented.

- [ ] **G005 — Full Feature Superset:** Applicable unique capabilities from Opera GX, Chrome, Firefox, and Edge are implemented and verified, with unresolved exceptions explicitly retained.

- [ ] **G006 — Complete User Control:** Features and extensions can be configured, combined, enabled, disabled, and organized without unnecessary restrictions.

- [ ] **G007 — Zero First-Party Telemetry:** Real network verification demonstrates that Noxviola does not perform undisclosed user tracking or analytics transmission.

- [ ] **G008 — No Unnecessary Bloat:** Representative performance tests demonstrate efficient full-process behavior without reducing functionality.

- [ ] **G009 — Security and Reliability:** Browser, extensions, website content, permissions, identity isolation, persistence, and recovery are runtime-verified.

- [ ] **G010 — Correct Architecture:** Electron remains until a demonstrably superior solution exists. No premature migration sacrifices functionality.

- [ ] **G011 — Verified Deliverables:** Coherent source changes, accurate test evidence, real application builds, parity records, and continuation checkpoints are preserved and published through authorized project channels.

- [ ] **G012 — Ultimate Product Convergence:** Noxviola has satisfied the complete accepted product scope, with no hidden missing features, fake compatibility claims, unresolved critical regressions, or unverified superiority claims.

- [ ] **G013 — Native AI Orchestration:** AI-M1–AI-M6 and T016–T024 satisfy real multi-job, model selection, provider, Constellation parity, security, recovery, persistence, and equivalent-work native performance acceptance. Keep unresolved provider capabilities explicit; no fake completion.

Intermediate working builds should be delivered throughout development. Do not withhold useful progress merely because the ultimate feature-superset goal is not yet complete.

# FINAL DIRECTIVE

**NOXVIOLA MUST BE THE BROWSER THAT MAKES ALL OTHER BROWSERS UNNECESSARY.**

Combine the best capabilities of Opera GX, Google Chrome, Mozilla Firefox, and Microsoft Edge.

**Let users run extensions originally designed for any major browser through one brilliant, automatic compatibility system.**

Let every user configure their ideal combination of features, extensions, layouts, workflows, and privacy settings.

Eliminate unnecessary bloat.

Eliminate first-party telemetry.

Deliver exceptional speed and stability.

Improve the original browsers' features rather than merely copying them.

Preserve everything useful.

**Do not settle for a browser that merely looks impressive. Build one that is genuinely more capable, more customizable, more efficient, and more enjoyable to use.**

**ELECTRON FIRST. COMPLETE FUNCTIONALITY FIRST. UNIVERSAL EXTENSIONS AS A FLAGSHIP FEATURE. RUST ONLY IF PROVEN SUPERIOR.**

**NOW CONTINUE ACTUAL DEVELOPMENT FROM PR #5.**