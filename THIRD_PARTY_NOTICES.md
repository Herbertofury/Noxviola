# Source, dependency and artwork notices

## Noxviola and Enderloom

Noxviola application source is distributed under the repository's [GPL-3.0-only license](LICENSE). Browser lifecycle patterns were adapted from [Enderloom main.js at commit 64d6608269021852a419ba19b4f94ed014547ba5](https://github.com/Herbertofury/Enderloom/blob/64d6608269021852a419ba19b4f94ed014547ba5/main.js), also GPL-3.0-only. Enderloom remains preserved as the source/behavioral baseline. This is not a claim of complete Enderloom feature extraction.

## Existing owner-supplied Noxviola artwork

`browser/assets/noxviola.png` is a byte-for-byte reuse of the existing repository asset at:

`native/hermes/apps/hermes-desktop/resources/noxviola.png`

The source is preserved in the separate native checkpoint, introduced in [commit 76457753045daeeeb601a0f789cb259f386d1939](https://github.com/Herbertofury/Noxviola/blob/76457753045daeeeb601a0f789cb259f386d1939/native/hermes/apps/hermes-desktop/resources/noxviola.png). That checkpoint's [native README](https://github.com/Herbertofury/Noxviola/blob/76457753045daeeeb601a0f789cb259f386d1939/native/README.md) describes owner-supplied fox-and-globe artwork, and its [asset README](https://github.com/Herbertofury/Noxviola/blob/76457753045daeeeb601a0f789cb259f386d1939/native/assets/README.md) records approved existing artwork exports without image generation.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Source PNG and reused Electron PNG | 106,553 | `abef94b8b011b63c7b3da9bf2ffd3b6ea802bae169bef5a92835a5666441a593` |

No new artwork was generated, redrawn or downloaded for this reuse. This notice records the existing repository provenance; it does not add a new authorship, ownership or standalone asset-license assertion beyond those source records. No Firefox logo asset was introduced.

## Packaged dependencies

The lockfile is the authoritative version graph. The current preview packages Electron **44.11.3** and the production JavaScript dependency closure headed by **yauzl 3.4.0**, with **pend 1.2.0**. Their original license files accompany the packaged dependencies/runtime. Development-only test and packaging tools are not application runtime dependencies.

| Dependency | Declared license | Upstream |
| --- | --- | --- |
| Electron | MIT; bundled Chromium and other components have their own notices | [electron/electron](https://github.com/electron/electron) |
| yauzl | MIT | [thejoshwolfe/yauzl](https://github.com/thejoshwolfe/yauzl) |
| pend | MIT | [andrewrk/node-pend](https://github.com/andrewrk/node-pend) |

This inventory supplements the complete notices shipped with those components; it does not replace them or relicense their code. Build manifests record the actual packaged files and hashes.

## Evaluated but not bundled

`electron-chrome-extensions` **4.10.0** was inspected as a maintained integration candidate. The exact inspected artifact is MIT-licensed, and its digests and source findings are recorded in [the extension architecture audit](docs/browser/EXTENSION-ARCHITECTURE.md). It is not a dependency or runtime included in this checkpoint. CEF, CefSharp, WebView2, Servo and Hermes research does not imply they are bundled into the Electron application.
