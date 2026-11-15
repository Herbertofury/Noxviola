# Builds, downloads and release qualification

## Current status

The browser is experimental source. **No production release is qualified.** GitHub Actions may publish temporary, unsigned **UNVERIFIED preview packages**; those are not GitHub Releases or proof of native functionality/security. The previous sandbox-enabled native launch failed with a process-socket permission denial, and that denied route is not retried by packaging jobs.

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

The official `@electron/packager` **20.3.0** downloads pinned Electron **44.11.3** as needed. Packaging does not execute the browser. Output is under `dist-preview/` for the host platform/architecture, with a source/dependency content identity so a later preview does not overwrite a different earlier build. For source development with `npm start`, install normally with `npm ci` so Electron's official installation script supplies its executable.

Only explicit browser source/assets, capability data, application metadata, the GPL license, [source/artwork notices](../../THIRD_PARTY_NOTICES.md) and the exact production dependency closure enter the staged app. The production closure currently contains `yauzl` and `pend`; DOM testing and packaging dependencies are excluded. Historical backlog, `.env`, profiles and personal vault/account/permission data are not copied. Runtime/dependency licenses are retained. Each output includes `PACKAGE-MANIFEST.json` with source commit/dirty-state evidence, engine/tool versions, platform/architecture, file SHA-256 hashes and packaged bytes. This is reproducibility/integrity metadata, not a security certification or total installed profile/cache footprint. No signing keys, credentials, installer elevation, OS settings or release-write token are needed.

## Run the separate native gate

```sh
npm run test:native
```

See [the fixture guide](../../tests/native/README.md) for exact scope. The runner uses fresh marked temporary data, local synthetic fixtures and two actual Electron launches. It records source hashes and runtime results. Exit **0** is a pass of the recorded workflows, **1** is failure and **2** is an environment blocker. It refuses sandbox-disabling or process-mode overrides. Native file-picker interaction, the complete extension corpus, actual internet compatibility, security and whole-process performance require additional acceptance even after this fixture passes.

The current development workspace stopped at display preflight before an engine attempt. Its blocked result does not close any native release gate and does not supersede the preserved earlier socket-denial history.

## Required before a real release

1. Independent code/security review and final-build native acceptance on supported desktop OSes.
2. Actual startup/navigation/recovery/permissions/download/media/accessibility flows and sessions >12 tabs with duplicates.
3. Two distinct identities on the same origin: cookie, localStorage, IndexedDB, service-worker/cache separation; popup and side-by-side routing; lock/restore and no cross-account attribution.
4. Vault/account add/edit/search/archive/restart/export tests with no public private data. Password-manager integration stays unimplemented until supported, reviewed origin-bound workflows exist.
5. Measured full-process startup/memory/disk/input/scroll and representative long sessions. No superiority claim without equivalent required features.
6. SBOM/dependency/license review, signed distribution strategy, update verification/rollback plan and explicit release approval where required.

A build failure retains its logs and blocks the artifact; it does not become a release by renaming it. Source and prior history remain recoverable independently of temporary artifacts.
