# Independent preferences, page tools and resource visibility

These features extend the existing Electron browser and reuse its session writer, native tab objects and recovery primitives. The current source is the authority for available controls; a passing portable contract is not a substitute for a native result.

## Preferences

Open **Tools → Preferences** or the native **Browser → Customize** menu. The form holds unsaved input across background tab events. Saving validates the complete candidate before replacing preferences, rebuilds the native shortcut menu, updates actual view geometry and waits for the session writer. A persistence error remains visible and does not become a successful saved result.

| Control | Available behavior |
| --- | --- |
| Tabs | Horizontal strip or vertical sidebar, independently of identity/workspace and extension choice. |
| Theme | Dark, light or the system appearance, with violet, blue, teal, rose or amber accent. |
| Density | Comfortable or compact browser controls. This does not change page rendering or suppress site work. |
| Toolbar | Home, Library, Extensions and Split can each be shown or hidden. Native menu actions remain reachable. |
| Bookmarks bar | Optional identity-specific saved websites/folders, with native page geometry adjusted below the bar. |
| Home page | `about:blank` or an HTTP(S) address without embedded credentials. |
| Search | DuckDuckGo, Google, Bing or a custom HTTP(S) template with exactly one `{searchTerms}` placeholder. The whole query is URL-encoded. |
| Shortcuts | Each supported native menu action can have a different accelerator or an empty value to disable its shortcut. Conflicts are rejected after platform alias resolution. |

The shortcut editor covers new/close/restore/duplicate/next/previous tabs, address/find focus, bookmarks, history, downloads, reload/bypass-cache, navigation/home, zoom, print, fullscreen and developer tools. **Reset shortcuts** edits the draft; **Save preferences** commits it. `CmdOrCtrl` follows the platform; the literal plus key is written as `Plus`.

Preference defaults are filled for older sessions while unknown saved metadata remains preserved. Known unsupported values block silent reinterpretation. There is no browser-brand mode that disables features from another ecosystem.

## Reviewed presets

Export writes a versioned `noxviola-preferences` JSON document containing supported presentation/navigation/shortcut preferences. Identity records, browsing history, bookmark data, account metadata, extension grants and unknown private metadata are excluded.

Import first displays the exact proposed field changes. Cancel leaves current preferences untouched. Apply requires that preferences still match the review's baseline; an intervening change requires a new review. Invalid or future preset formats are refused. Presets transfer the currently supported choices; they do not install extensions or enable unavailable features.

## Page tools

Find supports next/previous matches, Enter/Shift+Enter and a visible match count. Escape clears the search. Native page zoom is bounded to 25–500% and saved by identity and HTTP(S) origin. Print uses the actual native print dialog. Save as PDF uses the native page PDF renderer, while the screenshot action saves the visible page image.

Exports use the user's chosen destination. An existing destination requires an explicit replacement decision and an unchanged-byte check; new files use exclusive creation. Browser close waits for admitted asynchronous commands. Fullscreen and developer tools invoke native window/page controls. OS picker interaction, printing hardware, PDF fidelity and all accessibility combinations require their own runtime/manual evidence.

## Resource panel

Open **Tools → Resource monitor**, then refresh when another sample is useful. There is no periodic timer, monitoring worker, automatic upload or always-running resource collector. The first CPU sample has no previous interval and is displayed as unknown rather than zero. Later samples report Electron's interval values. Missing process fields remain unknown.

The panel records one row per native process and associates all known tab/extension contexts with that row, preserving shared-process ownership. Extension attribution requires both runtime origin and the same native Session. Some processes have no page owner. Memory values are converted from the engine's kilobyte units; summing working sets can count shared physical pages more than once. These observations are diagnostic measurements, not evidence that Noxviola is faster or uses less memory than another browser.

## Validation ownership

- `tests/preferences.test.cjs` verifies defaults, unknown metadata, unsafe templates, shortcut conflicts, secret-free preset fields and saved session round-trips.
- `tests/renderer-product.test.cjs` executes the production renderer and verifies dirty drafts, committed appearance, toolbar and bookmarks visibility, identity-bound bookmark/history forms and workspace drag behavior.
- `tests/resources.test.cjs` verifies explicit sampling, missing values, shared-process rows and native-Session attribution.
- `tests/native/packaged-driver.cjs` drives actual product forms and validates live page geometry, tab/identity retention and normal restart from the packaged executable. Its passing receipts, when available, establish only the recorded workflows.

The full customization, performance, privacy and product-superset gates remain open. Arbitrary toolbar rearrangement, gestures, font/style ecosystems, all tab behaviors and equivalent-workload comparative benchmarks are not implied by these controls.
