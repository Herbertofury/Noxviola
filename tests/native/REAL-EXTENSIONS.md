# Unchanged upstream extension gate

This is a separate, explicit native gate. It does not run in `npm test`, does not alter the synthetic or packaged-browser gates, and does not prove universal extension compatibility. A passing portable harness contract is not an extension execution result.

## Pinned input

The first corpus member is the unchanged **Dark Reader 4.9.135 Chrome MV2** release ZIP:

- Release: <https://github.com/darkreader/darkreader/releases/tag/v4.9.135>
- Asset: <https://github.com/darkreader/darkreader/releases/download/v4.9.135/darkreader-chrome.zip>
- GitHub release asset ID: `715443474`.
- Archive size: `849850` bytes.
- Archive SHA-256: `13b081f8aa13c8e3887957570e5ff67f42bd48fef5f3fbe04770eae79a0921f3`.
- Source tag commit: `dbf2a1029131280d9dab21ed29f1dfdeb51a6cc7`.
- License: MIT; pinned source license URL, Git blob and SHA-256 are in [the corpus descriptor](corpus/darkreader-4.9.135-chrome.json).

The archive was acquired from the upstream release and its bytes matched the release API digest. The manager imports it as an explicitly reviewed local ZIP; this does not confer marketplace signature or publisher verification. No source-to-release reproducible-build claim is made. The ZIP is not rewritten, stripped, repacked or committed to this repository. The separate descriptor is provenance, not a runtime receipt.

The manifest requests `alarms`, `fontSettings`, `storage`, `tabs` and `<all_urls>`, with optional `contextMenus`. It has a persistent `background/index.html` and `ui/popup/index.html`. It does **not** declare an options page: its own popup Settings handler opens `ui/options/index.html` through `chrome.tabs.create`. The gate must reach that actual handler; directly opening the file would conceal a compatibility defect.

## Invocation and environment

Download the exact asset to an explicit path using the ordinary upstream release URL. The runner verifies the byte count and SHA-256 itself before launching. The selected archive path is mandatory; it never searches an ambient browser profile or marketplace account.

```sh
node scripts/real-extension-smoke.cjs \
  --archive /absolute/path/darkreader-chrome.zip \
  --output /absolute/path/real-extension-records
```

Use the repository's locked Node/Electron toolchain and the same ordinary-user desktop prerequisites as the existing source native gate. Linux needs a normal desktop or a hosted Xvfb desktop. Root, unsafe sandbox switches, `ELECTRON_RUN_AS_NODE`, `ELECTRON_DISABLE_SANDBOX`, `NODE_OPTIONS` and `NODE_PATH` are refused. No local engine execution is authorized merely by preparing these files.

The wrapper creates a fresh marked temporary context, starts a loopback-only fixture server, verifies and copies the original archive byte-for-byte, and writes a receipt binding the archive, profile token and source manifest. It then starts the separate entry:

```text
Electron tests/native/real-extension-driver.cjs ABSOLUTE_CONTEXT_JSON ABSOLUTE_CORPUS_RECEIPT_JSON
```

Direct calls without the marked context and exact admitted receipt are refused. The wrapper includes its own source bytes, the acquisition helper and the dedicated workflow in addition to the recursive existing native source manifest, and verifies source/archive bytes again after execution. It does not modify any production preferences, preload, session resolver, security setting or extension file.

## Required observed workflow

All eight checks are required, in order:

1. Load the deterministic local light page through the actual address form; record native white pixels, computed styles, the document marker and renderer security preferences.
2. Click the actual package import control. Supply only the native picker response, then review the actual permission/compatibility text, explicitly select the generated identity and Chromium compatibility behavior, click the acceptance checkbox, and click Install. Match the preview archive digest, manager package digest, real installed card and native Session runtime. Verify selected installed release files against their original hashes.
3. Observe the actual persistent background document. Keep uncaught exceptions, preload errors, renderer failures, API surface diagnostics and console records. A loaded manager row does not establish this or any later behavior.
4. Navigate once to a fresh instance of the same local light page. Require both actual Dark Reader styles and native captured pixels to darken, alongside changed computed styling.
5. Click the real toolbar action and observe the unchanged popup in the same identity. Require a rendered package icon and the popup's actual enabled control.
6. Click the popup's real Off control once. Require the same page to return to light native pixels.
7. Click its real On control once. Require the same page to darken again.
8. Click the package's More section and actual Settings control. Require the package-requested native options document and a working real settings-section switch. The harness never directly navigates to the options file or supplies an API shim.

Observation uses event records and bounded readiness polling, not repeated installation, navigation, API calls or delay-based retries. The first failing check and original error are written before optional failure diagnostics. Later checks remain unreached. A missing API remains an actual compatibility failure; the test must not skip it, grant extra permissions, rewrite the package or fabricate a successful return.

The shared click helper observes an actual visible enabled control before invoking its handler once, so asynchronous panel IPC is not confused with a missing button. Package observers use `fs.realpathSync.native` to resolve opened filesystem paths. They require the native target's physical parent to match the owned package root, then independently resolve `root/basename` and require that direct child to have the same physical file identity as the native target. No case folding or lexical short/long-path comparison substitutes for those checks. A missing identity, foreign link, nested directory or changed target is rejected. The accepted native runtime ID is also bound to the exact enrolled directory before it is used for diagnostics.

The original [50431f79 real run](https://github.com/Herbertofury/Noxviola/actions/runs/43782023029) failed these harness stages and remains preserved. Windows used `RUNNER~1` in the generated profile and `runneradmin` in the actual native extension path; the ordinary [Node 24.22.2 realpath walk](https://github.com/nodejs/node/blob/v24.22.2/lib/fs.js) retains non-link spelling, so a final lexical comparison incorrectly rejected the owned directory. The native entry uses [libuv's opened-handle final path](https://github.com/nodejs/node/blob/v24.22.2/deps/uv/src/win/fs.c). Linux reached the real loaded background, then the diagnostic collector dereferenced a null preference object. Pinned [Electron 44.11.3 `GetLastWebPreferences`](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/electron_api_web_contents.cc) explicitly returns null when the context has no Electron preference object. Diagnostics now retain that unavailable value as null and continue recording the committed document. They never invent secure preferences; the ordinary page's strict sandbox, context-isolation and Node-integration assertions are unchanged. Neither earlier failure establishes an additional package API defect.

After each fixture navigation, `presentation.cjs` temporarily subscribes to full native compositor frames for the exact visible, loaded document and positive target bounds. It requires a nonempty frame at the physical size derived from the view's logical bounds and native display scale, following the pinned [Electron FrameSubscriber](https://github.com/electron/electron/blob/v44.11.3/shell/browser/api/frame_subscriber.cc). Page zoom is not substituted for display scale. The document, bounds and scale must remain unchanged; the receipt records both logical and physical sizes. The helper ends the subscription on success, navigation, renderer loss, destruction or the existing 15-second failure deadline. The subsequent `capturePage` calls remain unchanged and their failures remain failures. This is native presentation evidence, not a fixed delay, hidden repaint or screenshot retry. The original `f76e79d9` Linux baseline `UnknownVizError` and later successful diagnostic screenshot are retained separately; their coexistence does not prove the generic Viz error's cause or that presentation gating repairs it. Both 50431f79 hosted baselines subsequently recorded a matching full frame and passed their unchanged first capture, before the separate harness failures above. Complete real-package acceptance remains pending.

The success path closes the actual main `BrowserWindow`, allowing the production preventable close event and awaited session writer to finish. The passing receipt is written only after normal window closure and `will-quit`, and the wrapper additionally requires exit zero. A DOM `window.close()` or early result flag cannot qualify the run.

## Network and data boundaries

The deterministic page has no scripts, forms, accounts or remote assets. The package keeps its ordinary default network behavior; public read-only onboarding/config requests can occur. Observational native CDP records request addresses, parameter names, initiators, response status and failures. It does not intercept requests, replace responses or install a `webRequest` handler. Query values, credentials, request bodies and response bodies are not captured by the network observer.

This is not a complete browser/extension privacy audit. WebContents observations do not cover every engine or worker request, and the gate does not exercise accounts, credentials, messaging, external form submissions or purchases. Raw console errors are retained from this disposable profile for diagnosis. No real user profile is read.

## Results and CI integration

Exit codes are strict:

| Exit | Meaning |
| --- | --- |
| `0` | The exact recorded eight workflows and normal process close passed. |
| `1` | Admission, a workflow, observation integrity, close, byte verification or cleanup failed. |
| `2` | The required safe environment or Electron distribution was unavailable; execution is blocked and has not passed. |

Each run writes a fresh `run-*` directory containing:

- `real-extension-acceptance.json`: wrapper, source, archive and process-level result.
- `corpus-receipt.json`: exact upstream/archive/source/profile binding.
- `real-extension.json`: ordered native checks, first failure, lifecycle, console, exceptions, request observations and page samples.
- `electron-real-extension.log`: original native process output.
- `real-extension-*.png`: generated page/popup/options screenshots for reached stages only.

The disposable profile and installed package are cleaned up separately and must not be uploaded as evidence. Retain all raw result/log/image bytes from failures and successes. A dedicated CI matrix should download the pinned archive, run the wrapper on ordinary Windows/Linux desktop workers, preserve artifacts with `if: always()`, and let exit `1` or `2` fail the gate. It must not use `continue-on-error`, edit the package, share a real profile, disable the sandbox or substitute the synthetic fixture result.

Portable contracts: `node --test tests/real-extension-harness.test.cjs tests/native-presentation.test.cjs`. These validate archive/receipt admission, evidence completeness, pixel acceptance, source binding, actual renderer/control ordering, owned-path observer admission, native presentation lifecycle and the local page server without launching Electron or executing Dark Reader. Native acceptance is pending until an actual passing workflow receipt exists. Other versions and packages remain separate corpus work.
