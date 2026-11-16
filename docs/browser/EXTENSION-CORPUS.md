# Real extension corpus: pinned source review

Review date: **2026-11-15**. Status: **all packages unexecuted**. This is dependency discovery for the Electron-first browser, not an installation allowlist, native acceptance result or universal-compatibility claim. Generic package admission remains in the canonical manager. The corpus should grow when a real package exposes a missing behavior; it must not become a closed list of favored extensions.

The first set covers dark mode, session productivity and userscripts. Five official release archives were downloaded without executing their contents, checked against GitHub's published SHA-256 asset digests and sizes, and inspected as ZIP data. Thirty-one selected source files were fetched at exact upstream commits and verified against their Git blob IDs. No package build, extension installation, marketplace authentication, CRX stripping, signature bypass or local Electron launch occurred.

## Versions, provenance and browser classes

| Project and release | Exact source commit | Reviewed variants | Upstream main license |
| --- | --- | --- | --- |
| [Dark Reader 4.9.135](https://github.com/darkreader/darkreader/releases/tag/v4.9.135), published 2026-11-06 | `dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7` | Official Chrome MV2 ZIP, Chrome MV3 ZIP and Firefox XPI | [MIT](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/LICENSE) |
| [Tab Session Manager 7.4.0](https://github.com/sienori/Tab-Session-Manager/releases/tag/7.4.0), published 2026-07-17 | `737f15886b04b6e4aaa2d1b62b51b854ed4a8270` | Exact tagged Chrome and Firefox source manifests and implementation. This release has no attached binary assets; no packaged artifact was invented or built. | [MPL 2.0](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/LICENSE) |
| [Violentmonkey 2.50.0](https://github.com/violentmonkey/violentmonkey/releases/tag/v2.50.0), published 2026-10-26 | `f3f4e7f50e92f84e83076046171e042ecce6c4ff` | Official MV2 WebExtension ZIP and MV3 ZIP | [MIT](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/LICENSE) |

The pinned [Dark Reader README](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/README.md) and [Tab Session Manager README](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/README.md) identify Chrome, Firefox and Edge distributions. Violentmonkey's [official installation page](https://violentmonkey.github.io/get-it/) identifies Chrome/Chromium, Firefox, Edge and Opera, and directs Opera users to its Chrome distribution. Therefore the corpus represents the **Chrome/Edge/Opera Chromium class and the Firefox class**, while retaining manifest variants. It does not assert a separate Opera binary, identical store packages, store acceptance or successful execution on any of those browsers. The dated website is supporting distribution guidance; the commit-pinned sources and downloaded archive digests identify this review's actual inputs.

The source tags and archives have official release provenance, but this review did not perform a reproducible build comparison between a source tag and its compiled archive. The listed licenses describe the projects' own licensing. Their bundled third-party code/assets may have additional notices; no upstream extension source or release archive is being vendored into the browser by this document.

### Downloaded release archives

| Official asset | Bytes | Verified SHA-256 |
| --- | ---: | --- |
| [Dark Reader Chrome MV2](https://github.com/darkreader/darkreader/releases/download/v4.9.135/darkreader-chrome.zip) | 849,850 | `13b081f8aa13c8e3887957570e5ff67f42bd48fef5f3fbe04770eae79a0921f3` |
| [Dark Reader Chrome MV3](https://github.com/darkreader/darkreader/releases/download/v4.9.135/darkreader-chrome-mv3.zip) | 850,821 | `6c59ba11f9733f6f1ba42e79113e2bf764c41f9d50103b527af736f55fbccf47` |
| [Dark Reader Firefox XPI](https://github.com/darkreader/darkreader/releases/download/v4.9.135/darkreader-firefox.xpi) | 850,388 | `1155548c24ae03ef07c4c35c4adda19dc7592982a37fa1e3e6dc61db731c3503` |
| [Violentmonkey MV2 WebExtension](https://github.com/violentmonkey/violentmonkey/releases/download/v2.50.0/Violentmonkey-webext-v2.50.0.zip) | 723,968 | `ef9c61a6ef9c975d4823c26b493d2017464f240bba39c476da1cd7795382d8b1` |
| [Violentmonkey MV3](https://github.com/violentmonkey/violentmonkey/releases/download/v2.50.0/Violentmonkey-mv3-v2.50.0.zip) | 720,927 | `72f1de5a2edc4bc3cd3b3ca06c2b3631cdde4f06f8ed9e8b2b565bf77258b36c` |

These checks bind the downloaded bytes to the observed official release metadata; they do **not** verify a marketplace publisher signature. No `META-INF/` signature metadata was present in the five reviewed archives, including the Dark Reader XPI. The separately published Violentmonkey MV2 CRX was not stripped, installed or substituted for the ZIP. The manager's existing CRX trust refusal remains in force.

## Actual manifest requirements

These are facts from the downloaded manifests, except the two explicitly labeled Tab Session Manager source manifests. A declared permission does not prove a functioning implementation.

| Variant | Background / injection | Required permissions and hosts | Optional scope |
| --- | --- | --- | --- |
| Dark Reader Chrome MV2 | Persistent `background/index.html`; document-start scripts, all frames, `match_about_blank` | `alarms`, `fontSettings`, `storage`, `tabs`, `<all_urls>` | `contextMenus` |
| Dark Reader Chrome MV3 | `background/index.js` service worker; MAIN and ISOLATED content worlds; document-start and idle scripts | `alarms`, `fontSettings`, `scripting`, `storage`; host `*://*/*` | `contextMenus` |
| Dark Reader Firefox MV2 | Background page; MAIN/ISOLATED content-world declarations | `alarms`, `contextMenus`, `storage`, `tabs`, `theme`, `<all_urls>` | None |
| Tab Session Manager Chrome source | MV3 module service worker | `storage`, `unlimitedStorage`, `tabs`, `downloads`, `identity`, `alarms`, `offscreen` | `tabGroups`; `https://www.googleapis.com/*` host |
| Tab Session Manager Firefox source | **MV3 background scripts with module type**, not a Chrome service-worker declaration | `storage`, `unlimitedStorage`, `tabs`, `tabGroups`, `cookies`, `downloads`, `identity`, `alarms` | `https://www.googleapis.com/*` in `optional_permissions` |
| Violentmonkey MV2 WebExtension | Background scripts; document-start scripts in all frames | `tabs`, `<all_urls>`, `webRequest`, `webRequestBlocking`, `notifications`, `storage`, `unlimitedStorage`, `clipboardWrite`, `contextMenus`, `cookies` | `downloads` |
| Violentmonkey MV3 | `sw.js`; user-script registration rather than equivalent static `content_scripts` | `tabs`, `webRequest`, `notifications`, `storage`, `unlimitedStorage`, `clipboardWrite`, `contextMenus`, `cookies`, `alarms`, `declarativeNetRequestWithHostAccess`, `identity`, `offscreen`, `userScripts`, `webNavigation`; `<all_urls>` host | `downloads` |

Source manifests: [Dark Reader base](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/manifest.json), [Chrome MV3](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/manifest-chrome-mv3.json), [Firefox overlay](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/manifest-firefox.json), [Tab Session Manager Chrome](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/manifest.json), [Firefox](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/manifest-ff.json), and [Violentmonkey template](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/manifest.yml) with its [variant transformation](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/scripts/manifest-helper.js). The compiled release manifests, not the common template alone, supplied the five artifact rows above.

The different Firefox background declarations and MAIN-world requirements are substantive engine compatibility questions. Relabeling a package MV2/MV3 or changing its source to make loading appear successful would not answer them.

## Examined call paths and concrete gaps

The initial dotted-reference scan was only navigation aid. It found strings such as `chrome.google.com`, guarded Thunderbird code and conditional browser branches, which are not unconditional API dependencies. The findings below follow real source call paths; the review does not claim it found every computed/aliased API or dependency.

### Dark Reader

In [`Extension.init`](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/background/extension.ts), startup unconditionally registers `chrome.alarms.onAlarm`, then reads `chrome.permissions.onRemoved`. Commands are guarded by the existence of `chrome.commands`. Automation later calls `alarms.create`; optional context-menu setup uses `permissions.contains`. Merely supplying tab/query and popup operations cannot qualify this startup path. Alarms and permission APIs are not supplied by the new host bridge and are outside the [pinned Electron support list](https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md); their real native availability/failure must be recorded before deciding the implementation path.

[`IconManager`](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/background/icon-manager.ts) changes `browserAction.setIcon` using size-to-resource-path maps, plus badge text/background color. The current bridge has real badge/title behavior but deliberately rejects `setIcon`. This is a specific, implementable visible gap. The paths include `../icons/...` from the background document, so resource resolution must respect actual extension document semantics while remaining inside the verified package.

[`UserStorage`](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/background/user-storage.ts) uses both local and sync storage. The [storage helper](https://github.com/darkreader/darkreader/blob/dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7/src/background/utils/extension-api.ts) reads `storage.sync` and checks `runtime.lastError`; the settings code has a local fallback when the helper returns null. That does not establish a fallback when the namespace itself is unavailable or throws before the callback. Electron's documented lack of `storage.sync` remains a concrete gap, not permission to silently map cloud sync to local data.

Other surfaced workflows include `fontSettings.getFontList`, command enumeration/update, Firefox `theme.update/reset`, and extension utility windows. The current single-window host explicitly rejects `windows.create`; a successful options popup is not evidence that Dark Reader's utility windows or Firefox browser theme work.

### Tab Session Manager

The [background entry](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/background/background.js) registers commands, tab/window events, downloads events and alarms. [`autoSave`](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/background/autoSave.js) creates/clears recurring alarms and uses real window state. Current tab/window read events cover part of this dependency, while command, alarm and download routing remain distinct missing integrations.

[`open.js`](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/background/open.js) creates and removes actual windows, groups tabs, uses Firefox title prefixes/container options, and supports both discarded-tab restoration and extension-owned redirect pages. Noxviola currently rejects window creation/removal, discarded/title/opener/container arguments and arbitrary extension-page tab navigation. Returning the existing window or dropping restoration fields would lose meaningful session behavior. A limited “add to current window” path is not full session restoration and must be named separately if later tested.

[`export.js`](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/background/export.js) uses downloads and, for Chrome MV3 blob handling, `offscreen.createDocument`. [Tab-group handling](https://github.com/sienori/Tab-Session-Manager/blob/737f15886b04b6e4aaa2d1b62b51b854ed4a8270/src/common/tabGroups.js) calls `permissions.request`, `tabGroups.query/update` and tab grouping. Noxviola's local workspace/group model is useful canonical infrastructure, but it is not yet the Chrome numeric group API.

The tagged release contains no ready binary asset. Its README's development instructions also require a credentials module. No development credentials, account permission or build was fabricated; only exact source was inspected. Cloud identity/sync is a separate opt-in service and is not needed to justify implementing local session restoration correctly.

### Violentmonkey

The [icon implementation](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/background/utils/icon.js) uses per-tab title/badge updates and calls `browserAction.setIcon` with both path maps and ImageData maps. Its catch handlers can hide icon failures from a superficial “background loaded” test; native visual/readback acceptance must observe the actual toolbar.

The [permission initializer](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/background/utils/permissions.js) reads `browser.permissions`, calls `contains` for optional downloads, and observes additions/removals where available. Current required-grant admission does not implement that optional-permission lifecycle. A fake `request/remove` result would break real user-script download policy.

Its [script API adapter](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/common/browser-scripts-api.js) makes the version split explicit: MV2 executes code through `tabs.executeScript`, whereas MV3 requires `userScripts.execute/getScripts/configureWorld/register/unregister`. The [offscreen path](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/background/utils/offscreen.js) creates a real extension document for blobs, clipboard and workers. Neither behavior can be replaced with a hidden host that merely keeps a worker alive or a success-returning registration stub.

The [cookie adapter](https://github.com/violentmonkey/violentmonkey/blob/f3f4e7f50e92f84e83076046171e042ecce6c4ff/src/background/utils/cookies.js) uses real cookie APIs after checking individual script scope. Firefox can add `firstPartyDomain` and use the sender tab's cookie store. The current host covers the authenticated identity's standard jar with required host grants; it deliberately rejects unsupported partition/container arguments. Native `webRequest`, frame targeting, notifications, clipboard and optional downloads are further functional requirements, not implied by the bridge's supported cookies and messaging.

## Next bounded implementation target

The initial inspection selected **real `action.setIcon` / `browserAction.setIcon`** as the first bounded implementation target. It is an observed dependency in two independent reviewed packages and uses the existing authenticated action record and visible toolbar without changing engine permissions, persistence policy or background lifetime. That implementation is now present with verified package PNGs, ImageData and an explicit reviewed Chromium/Firefox behavior profile; 86 focused portable contracts pass. Its native visible-image gate remains pending, as recorded in [the extension architecture](EXTENSION-ARCHITECTURE.md). This step does not make either package pass as a whole. Earlier references in this report to rejected `setIcon` describe the inspected bridge baseline.

The implementation must resolve resource paths under the correct extension-document base, require the same currently verified package/enrollment, validate size maps and ImageData dimensions/channel data, and produce an actual displayed image. Default and per-tab overrides must have real behavior. Paths into another extension, websites or arbitrary host files must not be admitted. Resource decode/read failures must leave the prior icon intact and reject the operation. Epoch revocation, tab removal and uninstall must clear owned UI resources.

The focused test plan is:

1. Contract tests for valid package-relative size maps, ImageData, default/per-tab selection, Chrome callback errors, Promise errors, path-origin refusal, malformed data and in-flight revocation.
2. A native generated package switches two visibly distinct known icons, reads actual toolbar state and captures the rendered pixels. Exercise tab switching, disable/re-enable and restart; require cleanup with no image/resource retention after removal.
3. After the icon checkpoint, run the exact pinned Dark Reader Chrome MV2 ZIP first through reviewed local installation in a fresh generated profile using Chromium behavior. Require original artifact SHA-256 and installed package digest, capture startup console/API failures before any probe, open a deterministic light fixture page, and inspect whether Dark Reader actually changes its computed appearance and its real action/options controls. Preserve the first actual failure and named workflow boundary. No prerequisites are guessed away: implement blockers in the order the unchanged package demonstrates them. Then repeat the corresponding Firefox XPI with explicit unsigned-import acknowledgement and Firefox behavior. Do not remove features, edit manifests, disable sandbox protection or count a caught failure as compatibility. Violentmonkey is the next independent implementation after these bounded observed cases.

### Larger dependency order

| Priority | Work | Required evidence before a compatibility claim |
| --- | --- | --- |
| First | The original bridge fixture passed on both platforms at b31e398; finish the real action-icon native gate | Exact source-bound native receipts; actual visual state and cleanup |
| Next real package | Execute unchanged pinned Dark Reader Chrome MV2, then its Firefox variant | First actual startup/feature failure; real page appearance and action/options behavior; no modified package or skipped requirements |
| Next | Actual grant introspection plus user-reviewed optional request/remove; commands bound to the canonical shortcut service | Denied/default scopes remain denied; native and host grants agree after restart/revocation; actual keyboard events, collision handling and identity isolation |
| Next | Real alarms and downloads backed by canonical services | Deadlines, recurrence, restart, disable/uninstall, actual file result and events; no polling/keepalive that changes extension lifetime |
| Product expansion | Real multiple-window ownership, tab groups, safe same-package tab navigation and discarded restoration | Lossless session restore with duplicate/order/group/window fidelity; all identities isolated |
| Engine prerequisite | MV3 service-worker startup/sleep/wake, offscreen documents, `userScripts`, DNR and Firefox-specific injection/container semantics | Pinned engine behavior and real upstream workflows; source-level API names alone are insufficient |

Alarms and permissions-API availability are likely startup blockers even after icons work. A denied optional grant is a valid state: Violentmonkey handles downloads being ungranted, and Dark Reader checks optional context-menu access only when that feature is enabled. Missing API support must not be confused with a requirement to approve optional permissions. The implementation must preserve those denials; this ordering identifies a bounded deliverable without concealing the remaining dependencies. The maintained browser adapter review remains relevant, but none of its unauthenticated routing, permissive consent defaults, no-op removal or retained-background behavior may be reintroduced to make a corpus package appear successful.

## Reproducibility and acceptance record

The scratch inspection retained the five original archives, release/tag/tree metadata, per-entry archive hashes, readable selected files and an exact-source receipt. Archive reads checked CRCs and entry sizes, validated paths and the absence of symbolic links, and never invoked script code. All 31 selected source files matched the official Git blob IDs after byte verification. These records are analysis inputs, not packaged application content.

| Reviewed manifest | SHA-256 |
| --- | --- |
| Dark Reader Chrome MV2 release | `4dc144e6b3fc7cb51222e0dc2b71f4cfbb6855e550aaff602799c12e78e5f7bd` |
| Dark Reader Chrome MV3 release | `518f82517f0462ca76b24b8e10b3a50479ed8173a58e9c43930d248c94bd78de` |
| Dark Reader Firefox release | `3063dc971ac345c631458bd6933903f22a008b0f606444eb3bcea651efd42200` |
| Tab Session Manager Chrome source | `c023a042e5499048bbd3414510e45613f18cf7aa5061b9f42f167db2fcc99006` |
| Tab Session Manager Firefox source | `bc1ac8522f245e31864002ea442776fb33c75ccd589135046ae7ceca25135bae` |
| Violentmonkey MV2 release | `1855602ed9d3b69e60bb3dc6218527befc1d13c7ee7352b36aac49d3c5cbdcb8` |
| Violentmonkey MV3 release | `02570cd744eecb51c0b53dd875c24826fa6d77b99948428b921246a65a48f24d` |

Future entries should record publisher/source, exact package bytes, permissions, engine and platform, tested task, expected side effects, original failure, and restart/disable/uninstall outcome. Updating one entry must not erase an earlier failed receipt. Store provenance, package loading, workflow success, browser-family parity and universal compatibility remain distinct acceptance levels. At this checkpoint, **every corpus entry has source-inspected status and native execution not performed**.
