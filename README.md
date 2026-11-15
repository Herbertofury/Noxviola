# Noxviola

A customizable purple browser and private favorites vault, beginning with Enderloom's working Chromium browser model. **Experimental 0.1 baseline, not a production-security or performance-qualified browser.**

## Try the source

Node 22+ and the pinned Electron dependency are required:

```sh
npm install
npm start
npm test
```

Named identities with separate persistent browser partitions, side-by-side identity tabs, tabs, address/search, navigation, find, reopen closed tabs, split view, source links and download destination selection are implemented. Use the identity menu to switch; ♙ adds a name (press Enter). The vault is one local app-wide library, not an identity-specific secret store. Actual cookie/storage isolation still needs native acceptance. Sessions preserve duplicate URLs and more than twelve tabs; inactive restored tabs load when selected. The **♡ Vault** saves websites, images, videos, creators and characters locally with collections, names, notes, favorites, search and JSON export. This first vault stores references, not downloaded copyrighted media. It does not upload or sync personal data.

The **☷ Account atlas** organizes site origins, labels/handles, identity associations and account/password-manager tracking markers. Open routes into the assigned identity; edit and reversible archive are supported. It stores metadata locally in plaintext, **never a password vault**. No credential autofill, manager connection or actual account login is claimed.

The visual direction is purple, adaptable and Firefox-inspired, with an original purple fox mascot to be designed later. No Firefox logo or mascot assets are copied. Feature Foundry/Athena themes are inspiration, not a mandatory design authority.

## Current boundaries

- Native packaged acceptance has not run. Current tests cover state/vault behavior and syntax, not full browsing.
- Site permission requests currently default to deny. Camera/microphone/geolocation need a reviewed permission UI before use.
- Enderloom's filtering, translation and broader workflows remain extraction work. Chrome/Firefox extension parity, password manager, sync, import, complete media behavior and security review are not yet delivered.
- Electron/Chromium is the compatibility baseline, **not pure Rust**. Rust and alternative engines must earn promotion through complete-work tests. No claim of being faster/smaller than Chrome, Edge, Firefox or Opera GX.
- Private vault/session files live in Electron's per-user application-data directory, outside this repository. JSON export is an explicit local action.

[Browser roadmap and provenance](docs/browser/README.md) · [Assistant's single consolidated backlog](https://github.com/Herbertofury/Noxviola/wiki/Assistant%E2%80%90Backlog)

Older project-index files are preserved for history while the live wiki becomes their maintained home. Held [PR #4](https://github.com/Herbertofury/Noxviola/pull/4) is untouched; the browser conversion does not approve it.
