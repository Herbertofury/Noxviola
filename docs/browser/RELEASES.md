# Builds, downloads and release qualification

## Current status

The browser is experimental source. **No production release is qualified.** GitHub Actions may publish temporary, unsigned **UNVERIFIED preview packages**; those are not GitHub Releases or proof of native functionality/security. The previous sandbox-enabled native launch failed with a process-socket permission denial, and that denied route is not retried by packaging jobs.

- [Contract checks](https://github.com/Herbertofury/Noxviola/actions/workflows/browser-contracts.yml): dependency-free Node tests and syntax, Windows/Linux.
- [Preview builds](https://github.com/Herbertofury/Noxviola/actions/workflows/preview-builds.yml): locked dependency installation, tests and packaging, Windows/Linux. A successful run exposes an Actions artifact; these expire after 14 days and may require GitHub sign-in. No claim of a download exists until the job succeeds.
- [Releases](https://github.com/Herbertofury/Noxviola/releases): reserved for separately reviewed publication, never automatically populated by this workflow.

## Reproduce a preview

Use Node >=22.12.0 and the repository lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
npm run package:preview
```

The official `@electron/packager` 20.3.0 downloads pinned Electron 44.4.5 as needed. Packaging does not execute the browser. Output is under `dist-preview/` for the host platform/architecture. For source development with `npm start`, install normally with `npm ci` so Electron's official installation script supplies its executable.

Only explicit browser source files, application metadata and GPL license enter the staged app. Historical backlog, `.env`, profiles, personal vault/account files and development dependencies are excluded by an allowlist. Runtime licenses are preserved by Packager. Each output includes `PACKAGE-MANIFEST.json` with exact source commit, engine/tool versions, platform/architecture, file SHA-256 hashes and total packaged bytes. This is reproducibility/integrity metadata, not a security certification or total installed profile/cache footprint. No signing keys, credentials, installer elevation, OS settings or release-write token are needed.

## Required before a real release

1. Independent code/security review and final-build native acceptance on supported desktop OSes.
2. Actual startup/navigation/recovery/permissions/download/media/accessibility flows and sessions >12 tabs with duplicates.
3. Two distinct identities on the same origin: cookie, localStorage, IndexedDB, service-worker/cache separation; popup and side-by-side routing; lock/restore and no cross-account attribution.
4. Vault/account add/edit/search/archive/restart/export tests with no public private data. Password-manager integration stays unimplemented until supported, reviewed origin-bound workflows exist.
5. Measured full-process startup/memory/disk/input/scroll and representative long sessions. No superiority claim without equivalent required features.
6. SBOM/dependency/license review, signed distribution strategy, update verification/rollback plan and explicit release approval where required.

A build failure retains its logs and blocks the artifact; it does not become a release by renaming it. Source and prior history remain recoverable independently of temporary artifacts.
