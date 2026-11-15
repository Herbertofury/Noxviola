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