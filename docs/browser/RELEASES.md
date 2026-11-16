# Builds, downloads and release qualification

## Current status

The browser is experimental source. **No production release is qualified.** GitHub Actions may publish temporary, unsigned **UNVERIFIED preview packages**; those are not GitHub Releases or proof of native functionality/security. The previous sandbox-enabled native launch failed with a process-socket permission denial, and that denied route is not retried by packaging jobs.

### Latest fully verified preview: 99942809

[Core run 43782744635](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635) passed at `999428099f5d59d91f7c437ae6eace2cdbe0264a`, tree `f4e8f803698ba2125e8d8a964a675446aa102843`: **302 contracts / 76 syntax**, source **3/18/10** and ordinary packaged **11/6** per platform. Independent readback verified all **66 exact raw Git inputs**, all **73 Linux / 74 Windows** distribution entries and every one of **48 ASAR members**. These exact previews use Electron **44.11.3**; the development **45.3.2 candidate remains pending**.

| Exact tested inner preview archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `Noxviola-PREVIEW-win32-x64-999428099f5d.zip` | 158,613,749 | `a22fea1ca0f85f1879be33c20a675968de7abeb94cf8b3ad4b1fe43c359494ad` |
| `Noxviola-PREVIEW-linux-x64-999428099f5d.tar.gz` | 123,503,268 | `1ac73f611be74ec29539fb96f61f5100fae553cac0a509d654630a6e737932cc` |

The outer Actions ZIPs contain the inner preview and its distribution receipt; they are separate files with different digests:

| Original outer portable artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Windows portable 14188269280](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14188269280) | 158,626,795 | `9b8bdb6b8c1b16820a931331fcb083e4994857b4968405a553bfe527ad433bea` |
| [Linux portable 14189201144](https://github.com/Herbertofury/Noxviola/actions/runs/43782744635/artifacts/14189201144) | 123,515,852 | `635fd0019544a3d7b1d70b6fa95231c5b40f12f86f37f9d68d51992b37fbb78b` |

The source manifest is `43f3a149d6f30cb1b141d10b32b1de307e1233a49a1b70d005c3de1a3887546b`; both application manifests are `cd0dc48b474130d4dc6b1fc6cb52976b55d047a5b7db5a6c0a1aa7753357777d`, and complete ASAR bytes match at `c3b80cc90cbd036c661d5269cbb307c28859921c3312b6e6b8922ceacd3448d8`. Complete OS distributions remain different. `99942809-independent-validation.json` is **137,134 bytes**, SHA-256 `f6ec978cce64ad5c7f7c418d357ce4720efaee5f2f6a5083973598d90c938b20`; [the global ledger receipt](../browser-capabilities.md#verified-global-core-checkpoint-at-99942809) records the native artifact digests and full limits.

Both new actual source PDFs received separate exact text/link/visual readback in `pdf-qa-99942809/pdf-content-validation.json`, **5,274 bytes**, SHA-256 `8b0bd829246da14bbbc22bc6ad40a7837afcab93c2813a078e65d4f33fdbae9a`. The core result retains generated-fixture, source-only page-tool/download, supplied-picker and hosted-platform limits. It does not qualify physical OS gestures, arbitrary pages, owner Windows 11, universal extensions or a production release.

The separate [real-package run 43782744653](https://github.com/Herbertofury/Noxviola/actions/runs/43782744653) **failed actual initialization/page darkening** on both hosts after the light baseline, reviewed installation and background startup passed. The unchanged package raised null `applyToListedOnly` during `UserStorage.migrateSiteListsV2`; popup/Settings/restart workflows remain unqualified. [Pinned 45.3.2 documentation](https://github.com/electron/electron/blob/v45.3.2/docs/api/extensions.md) supplies the native sync-storage mechanism absent from 44.11.3, but candidate storage behavior, original-package functionality and a genuine 44-to-45 profile upgrade still require their own actual receipts. Local sync storage does not mean cross-device cloud sync. Every prior failure and all twelve open master gates remain preserved.

### Historical fully verified preview: 50431f79

[Core run 43782023018](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018) passed at `50431f79ff05322e6128b0d7262d22d6f25f19b8`, tree `45f7265afa3b98989d5e62b9ab4cc06eeeb5ebaa`: **301 contracts / 76 syntax**, source **3/18/10** and ordinary packaged **11/6** per platform. Independent readback verified all 66 exact raw Git inputs, all 73 Linux/74 Windows distribution entries and every one of 48 ASAR members.

| Exact tested inner preview archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `Noxviola-PREVIEW-win32-x64-50431f79ff05.zip` | 158,584,945 | `bdb66e8405a11df6ce0c13bc446f055e9380df3caa742aaa9be4a7c0e60a113f` |
| `Noxviola-PREVIEW-linux-x64-50431f79ff05.tar.gz` | 123,474,501 | `8cb5873a6922bf785c2fc397b179a2438685f4dd9a83452929617b0f63d97a36` |

Outer Actions artifacts are distinct: [Windows portable 14189065350](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14189065350), **158,597,991 bytes**, SHA-256 `59470aaa3eada00763a372f8663499659758c9eeade89b920c698a59e02451b9`; [Linux portable 14187899114](https://github.com/Herbertofury/Noxviola/actions/runs/43782023018/artifacts/14187899114), **123,487,085 bytes**, SHA-256 `4f427ebee0359ac6cac9db203c8c1f6f3144a95a6cbb6ba42f9b189dab37bd9c`.

The source manifest is `f9a374cc9245251b01c3c04815361ac37178933834112f1a092a32045d33f8f5`; both application manifests are `a81a1ab72ecde93e4077b44ef7590e618929b4c6d326020a0be568aa2fd8d9ed`, and complete ASAR bytes match at `a7dbb4fae6c3f36b85fd5a58e1f0fefd32061de23c04afe52eb70d30a00d45d8`. Complete OS distributions remain different. `50431f79-independent-validation.json` is **138,485 bytes**, SHA-256 `e847f07f3dd54daff403376296d7b19bb347603ca45f7e326e32d893aee593bf`; [the global ledger receipt](../browser-capabilities.md#verified-global-core-checkpoint-at-50431f79) records both native artifacts and scope limits.

The separate [real-package run 43782023029](https://github.com/Herbertofury/Noxviola/actions/runs/43782023029) failed during post-install test inspection on both hosts. No Dark Reader functional compatibility or production release follows from the core pass. The detailed ff feature receipts below, all earlier failures, and all twelve open master gates remain preserved.

### Historical fully verified preview: ff5432c

[Core native run 43781469795](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795) passed at `ff5432c22452fb6cbc78e926f696dc8a31ac1c8a`, tree `b3d11cdfe2f319d7b993111b6c1e456eefa7c176`. Raw logs on each hosted platform confirm **289 contracts / 73 syntax checks**, source seed/first process/restart **3/18/10**, and ordinary packaged first process/restart **11/6**. Native close was followed by clean exit and saved-session field comparison. The source gate additionally reached durable download history/restart/identity clearing, actual Find/zoom and generated PDF/PNG output; those specific new controls were not separately exercised in the packaged gate.

| Exact tested inner preview archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `Noxviola-PREVIEW-win32-x64-ff5432c22452.zip` | 158,582,910 | `2be79716e0ae8f1b5b0565d4f0e4f2e4e01c852f9c8253ba33fbcdec665213ca` |
| `Noxviola-PREVIEW-linux-x64-ff5432c22452.tar.gz` | 123,472,264 | `278d82a2dcafff2474b498c2f2e625c4d68df92933b58aadaaa4fc68cd7474d5` |

The original outer Actions ZIPs contain these archives and their distribution manifests. They have separate sizes and hashes:

| Original outer portable artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Windows 14188816517](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188816517) | 158,595,956 | `e73ba954fd7ddab64f16524ebeb81926fb8798474076648dd72d7f6b93c2b9d1` |
| [Linux 14188672341](https://github.com/Herbertofury/Noxviola/actions/runs/43781469795/artifacts/14188672341) | 123,484,848 | `a8595fd9924c0cf43ab4e14af95e129033d001a2521fb7e7e5b16f4abb4d5ab3` |

Independent readback verified all **74 Windows / 73 Linux** inner distribution entries and every one of the **48 ASAR members**. Both hosts' **65 source inputs** match raw Git bytes, clean and unchanged, with source manifest `eb0ded1e26069551016f332a1817e072089e98e8e745c1dfa72fc6ce11aec91c`. Both application manifests equal `75ab53c6b939824f01bb4feda06a1ab91c6eee52c2367ce90088eb9ef613afde`; complete ASAR bytes equal `0acf056701eef83570c006b4bb3682209677d015b7f7364ab4e61250d91ea4b7`. OS executables, runtime files, package manifests and full archives remain different. These unsigned **PREVIEW** packages qualify only the recorded workflows.

`ff5432c-independent-validation.json` is **134,346 bytes**, SHA-256 `1047e597d540f45b27c392bb0575430e8e125f3b1ca196527c3645dfcc041365`. It also matches all 51 files in each native artifact, the actual downloaded bytes, truthful restored history states, Find selection/counters, origin/identity zoom restart, decoded PNG pixels, cancellation sentinels, spelling state and optional private-memory availability. [The capability receipt](../browser-capabilities.md#verified-source-and-packaged-checkpoint-at-ff5432c) records the native artifact digests and complete scope limits.

The original CI PDF-reader gap is preserved. A separate subsequent readback of both exact generated PDFs is recorded in `pdf-qa-ff5432c/pdf-content-validation.json`, **5,262 bytes**, SHA-256 `ae701d478443cb545a7a08fe4f92d94db27c9e125e7e97c768df9541194b2b85`: each has one Letter page, expected text, two clickable generated loopback links and a clean independently inspected Poppler render. This does not qualify arbitrary pages/pagination, physical OS menu/picker gestures, printers or packaged exports. Likewise, private-memory sums cover only reported process rows and are not PSS or an efficiency result.

### Core and real-package results remain separate

`50431f79ff05322e6128b0d7262d22d6f25f19b8`, tree `45f7265afa3b98989d5e62b9ab4cc06eeeb5ebaa`, is a separately published required-grant permission-query/presentation continuation. Its exact isolated snapshot and both hosted core logs passed **301 contracts and 76 syntax checks**; independent core artifact qualification is complete, while the real-package inspection failed. The ff preview hashes above still refer only to ff; the exact 504 archives are separately recorded in their historical section above. Original ae00/0c/f76 real-extension failures and the f47 Find failure remain preserved, and all G001–G012 gates remain open.

### Historical fully verified preview: 0c25987e

[Core native run 43780308365](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365) passed at `0c25987e7e14cdc78790d8a9423962346b8fa3a9`, tree `532d4e6f3b0b5439a0aeec60bc2a6645ca623883`. Both hosted platforms passed the original-factory seed (3/3), source process (15/15), source restart (8/8), ordinary packaged executable (11/11) and packaged restart (6/6). Actual OS window-close delivery was followed by clean process exit and saved-session field comparison; omitted default flags are normalized explicitly. These finite workflows qualify unsigned **PREVIEW** artifacts, not a production release or the complete product gates.

| Exact tested inner preview archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `Noxviola-PREVIEW-win32-x64-0c25987e7e14.zip` | 158,577,570 | `ac201b9ba896522afffc7530b1b94d9567e1042f0fe71c97d3f494d32bde4048` |
| `Noxviola-PREVIEW-linux-x64-0c25987e7e14.tar.gz` | 123,466,759 | `19362ec0e471d5f38b2ac26af2cffe62ea23b952236941f85ebdfd146dc80331` |

The downloadable Actions artifact is a separate outer ZIP containing the archive and its manifest. Its bytes and hash are therefore different:

| Original outer artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Windows portable 14187961704](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14187961704) | 158,590,616 | `07bb33335b7c195b26fc4235bf848b7e306e19660531ef59dbdc891a715175e7` |
| [Linux portable 14187503341](https://github.com/Herbertofury/Noxviola/actions/runs/43780308365/artifacts/14187503341) | 123,479,343 | `c41f924ae354106cbe0e60033dcd5ddc37d53e35ecb116f7a9336da117f78c71` |

Independent readback verified every file entry in both complete distributions (**74 Windows / 73 Linux**) and all **48 application ASAR members**. All 64 source inputs matched raw Git bytes with a clean unchanged source manifest, `81ba838766fdfada2eb12a745c6741d7ca506d7383957fe8cff9c657c681cc11`. The application manifest is identical on both platforms, `0691988d89778c5e659a2f6563c2fb44b6e3ba0a578f4f65a0b432e26f52eb81`, as are complete ASAR bytes, `ff1b05e529013774d9033dd5901cbef0f2dcb5681d33f330e9a04b844e77a2e1`. The previous notice-file line-ending differences are resolved at this source. Operating-system executables, runtime files and complete distribution archives remain different.

The independent receipt `0c25987e-independent-validation.json` is **62,959 bytes**, SHA-256 `3ea58a8ec1adcba161507dfae15372b9badbe644cd7fb0fbaf876158b0f7667b`. The [capability ledger](../browser-capabilities.md#verified-source-and-packaged-checkpoint-at-0c25987e) records both native evidence artifact digests and the exact limitations. The spelling-specific source workflow passed local checking state and restart; it did not prove dictionary-download opt-out. Nine packaged resource samples per platform verified reported Windows private-byte sums and explicit Linux unavailability, without a deduplicated-memory or efficiency claim. Hosted Windows Server 2025 is not the owner's Windows 11 qualification.

### Historical f47 failure before the ff repair

The following records the original failed f47 result and pending state at that checkpoint. The later ff core qualification is recorded above; the separate real-extension failures remain failures.

Published `f47a4a389a17af35bc0708c37e64775c9e71207a` passed **289 contracts and 73 syntax checks** on both platforms, then [failed its native run](https://github.com/Herbertofury/Noxviola/actions/runs/43780987710) at initial Find after 15 source checks passed. Two exact 94,208-byte completed downloads and three persisted terminal history rows/UI passed before that failure. Native history restart/identity clear, later Find/zoom/PDF/PNG behavior, source restart and packaging were not reached. The causal initial/follow-up Find translation repair needs a new exact-source result; none of the 0c archive hashes refers to that changed source.

The original [ae00](https://github.com/Herbertofury/Noxviola/actions/runs/43779608644), [0c](https://github.com/Herbertofury/Noxviola/actions/runs/43780308399) and [f76](https://github.com/Herbertofury/Noxviola/actions/runs/43780643491) real-extension attempts remain failed. Their entry/panel readiness, actual Windows Dark Reader initialization dependency, and Linux capture failures are retained in the [checkpoint](CHECKPOINT-2026-11-15.md). Passing the core source/package workflow does not establish real third-party extension compatibility. All G001–G012 gates remain open.

### Historical tested preview: 3253be62

The later [hosted run 43778455094](https://github.com/Herbertofury/Noxviola/actions/runs/43778455094) passed the recorded source and **actual packaged-executable** workflows on both Windows and Linux at `3253be620fb8065a59e7be84ee2027e4a6993a19`. Each package launched through its ordinary ASAR entry, completed public HTTPS cases and generated identity/data workflows, closed through the real OS window protocol, saved the exact final session and restarted successfully. The complete portable archives were then read back and every entry verified. These unsigned **PREVIEW** artifacts qualify those bounded workflows, not a production release, universal extension support or the full privacy/security/performance gates. Earlier unexecuted and failed builds retain their earlier status.

| Exact tested preview | Bytes | SHA-256 |
| --- | ---: | --- |
| `Noxviola-PREVIEW-win32-x64-3253be620fb8.zip` | 158,563,426 | `5b8a10ca480aa2c0875ca84dcbd4d620c47333859416d7652290bf5785e95141` |
| `Noxviola-PREVIEW-linux-x64-3253be620fb8.tar.gz` | 123,451,949 | `0456289c6ee68de4a9e806286857d0551e9c1b3f9f48e0490389a696cdf9976e` |

## Build and acceptance workflows

- [Contract checks](https://github.com/Herbertofury/Noxviola/actions/workflows/browser-contracts.yml): portable service/renderer tests and syntax with locked development dependencies, Windows/Linux.
- [Native acceptance](https://github.com/Herbertofury/Noxviola/actions/workflows/browser-native.yml): actual sandboxed Electron and synthetic local fixtures on a supported host. A missing desktop is a blocked result, not a pass. A workflow link does not imply that a remote run succeeded.
- [Preview builds](https://github.com/Herbertofury/Noxviola/actions/workflows/preview-builds.yml): locked dependency installation, tests and packaging, Windows/Linux. A successful run exposes an Actions artifact; these expire after 14 days and may require GitHub sign-in. No claim of a download exists until the job succeeds.
- [Releases](https://github.com/Herbertofury/Noxviola/releases): reserved for separately reviewed publication, never automatically populated by this workflow.

## Reproduce a preview

Use the Node engine range in `package.json`: Node **22.22.2+ within 22, 24.15.0+ within 24, or 26+**, and the repository lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
npm run package:preview
```

The official `@electron/packager` **20.3.0** downloads the exact locked Electron version from `package.json` as needed. The current development candidate is **45.3.2**; the fully verified 999 previews above remain pinned to **44.11.3** and do not qualify a new candidate build. Packaging does not execute the browser. Output is under `dist-preview/` for the host platform/architecture, with a source/dependency content identity so a later preview does not overwrite a different earlier build. `-- --platform win32 --arch x64` explicitly produces a Windows x64 preview, including when packaging from Linux.

For source development or native acceptance, provision the distribution
explicitly after `npm ci --ignore-scripts`:

```sh
npm run setup:electron
npm run check:electron
npm start
```

The pinned Electron npm package has no postinstall hook. Its JavaScript loader
can download lazily, but the native harness deliberately avoids that side
effect. `setup:electron` calls the pinned package's official `install.js`, using
its bundled checksums; `check:electron` verifies the version and executable as
files without launching them. A successful `npm ci` alone is not proof that the
Electron distribution exists.

Only explicit browser source/assets, capability data, application metadata, the GPL license, [source/artwork notices](../../THIRD_PARTY_NOTICES.md) and the exact production dependency closure enter the staged app. The production closure currently contains `yauzl` and `pend`; DOM testing and packaging dependencies are excluded. Historical backlog, `.env`, profiles and personal vault/account/permission data are not copied. Runtime/dependency licenses are retained. Each output includes `PACKAGE-MANIFEST.json` with source commit/dirty-state evidence, engine/tool versions, platform/architecture, file SHA-256 hashes and packaged bytes. This is reproducibility/integrity metadata, not a security certification or total installed profile/cache footprint. No signing keys, credentials, installer elevation, OS settings or release-write token are needed.

## Run the separate native gate

```sh
npm run setup:electron
npm run check:electron
npm run test:native
```

See [the fixture guide](../../tests/native/README.md) for exact scope. The runner uses fresh marked temporary data, local synthetic fixtures, a separate original-factory storage seed and two actual Noxviola launches. It records source hashes and runtime results. Exit **0** is a pass of the recorded workflows, **1** is failure and **2** is an environment blocker. It refuses sandbox-disabling or process-mode overrides. Native file-picker interaction, the complete extension corpus, actual internet compatibility, security and whole-process performance require additional acceptance even after this fixture passes.

The current development workspace stopped at display preflight before an engine attempt. Its blocked result does not close any native release gate and does not supersede the preserved earlier socket-denial history.

The separate hosted [Windows/Linux run 43769631926](https://github.com/Herbertofury/Noxviola/actions/runs/43769631926) passed at source `ac3a92f628519ae14f04a0499a665af8a7d89110`. It qualifies the recorded generated-store transition, navigation, identity isolation, extension/library lifecycle and normal restart workflows on those runners. Detailed receipt hashes and remaining boundaries are retained in the [continuation checkpoint](CHECKPOINT-2026-11-15.md). It does not change the unsigned **UNVERIFIED** distribution label or qualify a production release.

## Required before a real release

1. Independent code/security review and final-build native acceptance on supported desktop OSes.
2. Actual startup/navigation/recovery/permissions/download/media/accessibility flows and sessions >12 tabs with duplicates.
3. Two distinct identities on the same origin: cookie, localStorage, IndexedDB, service-worker/cache separation; popup and side-by-side routing; lock/restore and no cross-account attribution.
4. Vault/account add/edit/search/archive/restart/export tests with no public private data. Password-manager integration stays unimplemented until supported, reviewed origin-bound workflows exist.
5. Measured full-process startup/memory/disk/input/scroll and representative long sessions. No superiority claim without equivalent required features.
6. SBOM/dependency/license review, signed distribution strategy, update verification/rollback plan and explicit release approval where required.

A build failure retains its logs and blocks the artifact; it does not become a release by renaming it. Source and prior history remain recoverable independently of temporary artifacts.
