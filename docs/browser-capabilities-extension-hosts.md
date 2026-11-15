# Extension-host research and next architecture gate

Reviewed **2026-11-15** for the [Electron-first master goal](browser/MASTER-GOAL.md). This document compares implementation routes; it does not certify compatibility or authorize an engine migration. The current product continues PR #5 and the existing Electron services. The separate Rust/native PR #6 checkpoint remains preserved.

## Decision

Keep the canonical local extension manager already implemented, qualify its actual Electron runtime behavior, and harden a maintained API adapter before integrating it. Do not adopt an adapter's namespace list as proof that its permissions, events, contexts and return semantics are correct. If a required contract cannot be implemented correctly through this host, isolate that exact missing capability and evaluate a stronger host with equivalent-work tests.

The [implementation checkpoint](browser/EXTENSION-ARCHITECTURE.md) owns package inspection, persistent lifecycle, source findings and artifact digests. Its tests use a synthetic adapter and do not establish real extension functionality.

## Hosting alternatives

| Route | Primary-source evidence | Useful role | Boundary that remains |
| --- | --- | --- | --- |
| Electron 44.11.3 built-in host | [Pinned support document](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md), [pinned lifecycle API](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions-api.md) | Existing runtime integration; persistent-session unpacked loading, documented extension subset and developer-tools support. | Arbitrary Chrome extensions and complete Chrome compatibility are not Electron's promised scope. Noxviola must supply and test the missing browser concepts. |
| `electron-chrome-extensions` 4.10.0 | [Maintained repository](https://github.com/samuelmaddock/electron-browser-shell), [exact package audit and hashes](browser/EXTENSION-ARCHITECTURE.md) | Real application integration hooks for browser APIs; strongest immediate reuse candidate examined here. | The inspected package is MIT-licensed, but permission removal, host admission, sender identity and cleanup need repair and functional tests before adoption. It is not installed in Noxviola. |
| CEF with Chrome-style hosting | [CEF architecture](https://github.com/chromiumembedded/cef/blob/master/docs/architecture.md), [M128 extension transition](https://github.com/chromiumembedded/cef/issues/3685) | A candidate for a more complete Chromium browser host if an exact Electron limitation is demonstrated. | Old Alloy extension examples are obsolete after the documented M128 transition. Chrome-style-window constraints, custom UI integration, distribution and actual extension behavior require their own proof. |
| CefSharp | [Maintainer extension discussion](https://github.com/cefsharp/CefSharp/discussions/4937) | A .NET integration path to CEF for an appropriate Windows application. | It inherits CEF's extension architecture; a wrapper is not an independent universal extension engine. Host/UI/platform costs and current Chrome-style support must be qualified. |
| WebView2 extensions | [Microsoft Profile7 extension API](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7?view=webview2-1.0.4258.31) | A maintained Windows-host candidate with profile-bound extension installation. | Its unpacked extension folder is not copied, persistence depends on that folder/profile, and browser UI entry points such as extension icons/popups are not automatically supplied. This is Chromium-based, not a pure Rust web engine. |
| Safari WebExtensions | [Apple extension model](https://developer.apple.com/documentation/safariservices/safari-web-extensions), [native messaging model](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension) | Portable JavaScript/HTML/CSS can be evaluated through standard WebExtension contracts. | Apple containing apps and native app-extension components are separate platform dependencies. Portable inspection is not a promise that Windows can execute those native components. |

CEF issue [4327](https://github.com/chromiumembedded/cef/issues/4327) records a reported dynamic-resource compatibility problem. It is useful as an adversarial test case, not proof that every current CEF build fails or that the issue is solved. Version-specific candidate bugs and future fixes must be tested on the exact proposed host.

No candidate in this table has passed a complete equivalent-work comparison against the current Noxviola browser. A complete migration would need to preserve identity isolation, state/recovery, permissions, downloads, vault and account workflows, extension state, accessibility and the intended compatibility corpus. Installer size alone would not establish a total footprint benefit.

## What the pinned Electron documentation actually promises

The 44.11.3 source names unpacked extensions in persistent sessions and explicit loading on each application start. It documents a limited set of manifest keys and APIs. In particular, its storage section documents `storage.local` and explicitly says `sync` and `managed` are unsupported. Its background manifest entry names V2; this is not proof of V3 service-worker parity. Tabs have limited query/update semantics, and Chrome's special active-tab ID is not interchangeable with Noxviola's browser model. [Pinned source](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md)

The moving [latest support page](https://www.electronjs.org/docs/latest/api/extensions) already differs in storage wording. Record the source tag and actual engine version whenever asserting runtime support. A current Chrome feature, a declaration file or a latest website entry must not silently become a claim about the shipped Electron build.

The pinned source also gives application `session.webRequest` handlers precedence where they conflict with extension `chrome.webRequest`. Noxviola should therefore use one canonical request-policy owner and test composition before enabling its own filtering alongside real extension filters. Two independently installed handlers are not evidence that both policies execute. [Pinned source](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md)

## Why the maintained adapter is a candidate, not an accepted runtime

The inspected `electron-chrome-extensions-4.10.0.tgz` and `package/LICENSE.md` identify the package as **MIT**, unlike older indexed README text referring to GPL/commercial terms. Exact artifact digests are retained in the [source audit](browser/EXTENSION-ARCHITECTURE.md). Use the license accompanying the exact reused artifact, and retain its notice if code is adopted.

The package implements useful browser API services and callbacks. Source inspection also found a `permissions.remove` path that reports success without removing permissions, a fallback that approves permission requests without a supplied host callback, cookie operations/events without the necessary effective-host filtering, and dispatch that resolves a supplied extension ID without sufficient caller binding at that boundary. These are concrete source findings, not claimed demonstrated exploits. They prevent promoting the unmodified package under the accepted product contract. [Audited source locations](browser/EXTENSION-ARCHITECTURE.md)

The next repair should happen in that maintained implementation or a narrowly maintained fork, with tests and upstream contributions where appropriate. It should:

1. Authenticate the actual frame or worker and its owning session before resolving the extension.
2. Compute required and optional API permissions plus effective host access centrally.
3. Apply admission to methods **and events**, including cookie changes and request/navigation data.
4. Persist real grants and remove them on revocation, then prove denied calls stop working.
5. Release host references and handlers when an extension is disabled, removed or its identity closes.
6. Bind tab/window/action callbacks to Noxviola's existing browser services, preserving one runtime instance per intended identity.

A broad API-name allowlist would not fix these semantics. Conversely, detecting a security defect is not a reason to abandon the adapter's useful implementation and invent shallow replacements. The exact repairs, integration and native tests remain open.

## Cross-browser contracts that need distinct tests

The [MDN incompatibility guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) documents differences beyond namespace spelling: callback/promise behavior, message serialization, content-script worlds, extension URLs and native-host manifests. Current Chrome namespace support also has its own version conditions. Adding a `browser` alias can only address a namespace gap; it cannot create missing services or make Chromium's execution worlds behave like Firefox's.

| Contract | Required evidence |
| --- | --- |
| Manifest V2/V3 and background lifetimes | Actual background-page/event-page/service-worker start, suspension, wake, restart and cleanup. Chrome's [MV2 retirement](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline?hl=en) is separate from the pinned Electron host. The [background manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) describes variants to test. |
| Messaging | Sender identity, frame/tab fields, responses, asynchronous errors, JSON versus structured-clone values and cancellation. |
| Actions and sidebars | Popup lifetime, badge/title state, tab-specific overrides, click events, focus, accessibility, selected identity and Chrome `sidePanel` versus Firefox `sidebarAction`. |
| Tabs/windows/containers | Stable IDs, current-window semantics, creation/removal ordering, active state, groups, session restoration and Firefox contextual identities. |
| Storage | Real area semantics, quotas, events, restart, identity isolation and migration. Local persistence must never be labeled cloud synchronization. |
| Filtering | Listener ordering, permission scope, blocking/redirect behavior, DNR rule priority, dynamic/session rules and composition with browser-owned filtering. |
| Native messaging | Authorized host discovery, platform manifest differences, executable provenance, framing, lifetime and least-privilege consent. Native dependencies stay explicit. |
| Security and lifecycle | Optional/host permission revocation, hostile messages, disable/uninstall, background cleanup, updates/rollback and retained-versus-erased data. |

The current site-permission manager only accepts secure HTTP(S) origins, with loopback HTTP exceptions. Extension pages are not secure HTTP(S) origins for that policy. Their camera/microphone and other site-permission requests are denied until a separately authenticated extension-specific integration exists. Manifest acceptance and host permission acceptance must not be conflated with OS device consent.

## Package acquisition and trust

The local manager currently copies an accepted unpacked/ZIP/XPI package into an owned location, ties permission acceptance to unchanged bytes, and reports publisher trust as unverified. CRX input is explicitly blocked until its signature contract is implemented; renaming CRX to ZIP does not bypass that boundary. Unpacking an XPI likewise does not validate a Mozilla signature. [Current implementation and tests](browser/EXTENSION-ARCHITECTURE.md)

[Chrome distribution requirements](https://developer.chrome.com/docs/extensions/how-to/distribute) and [Mozilla signing/distribution rules](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) are part of acquisition design. A store URL does not automatically authorize scraping, bypassing authentication, redistributing packages, or treating an unsigned local copy as a verified marketplace release. Supported acquisition, source provenance, update verification and browser-to-browser settings migration remain separate work.

## Promotion evidence

For every candidate, retain package/browser version, engine/adapter tag, source digest, manifest, tested API members and contexts, synthetic fixture inputs, exact expected behavior, actual result and reproducible command. Then test real extensions from the requested ecosystems against their intended workflows. Loading an extension is only the first lifecycle observation.

Measure cold/warm startup, complete extension initialization, full-process memory/CPU, idle/background work, user-visible latency and disable/uninstall cleanup with equivalent installed extensions and settings. No arbitrary count limit, hidden truncation, forced termination of required work or fabricated successful API response is an acceptable performance improvement. Document measured wins only after that comparison exists.
