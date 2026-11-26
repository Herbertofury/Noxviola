# Noxviola native browser: experimental work

This directory contains an **unfinished engineering candidate**, not a browser
release. The existing Electron draft remains in [PR #5](https://github.com/Herbertofury/Noxviola/pull/5),
untouched and unmerged. Enderloom and existing browser profiles are not modified.

* `hermes/` starts from [Hermes Browser](https://github.com/KaykCaputo/hermes-browser)
  commit `a41f18eab54930cecd2e2db10d3c27d6ebaf5ae9`, under its MPL-2.0
  license. Its Servo 0.7 / Slint shell is a candidate, not a completed engine
  selection or a claim of Windows compatibility. Its upstream license and
  third-party files are preserved in that directory.
* `core/` is a GPL-3.0-only session-data library derived from the documented
  PR #5 format. It preserves unknown fields and checkpoints and does not
  itself provide isolated browsing identities.
* `import-enderloom/` is a read-only parser for explicitly selected Enderloom
  JSON. It does not migrate cookies, authentication, or data automatically.
* `assets/` contains the owner-supplied fox-and-globe icon exports.

The Hermes candidate is not ready for ordinary browsing. Upstream reports
that content processes lack operating-system sandbox restrictions; Windows
media, downloads, permissions, extensions, and isolated profiles are not
established. No compatibility, security, or performance advantage is claimed.
Do not use real accounts or profiles with an unverified build. Session and
import code tests use synthetic fixtures; their success does not prove runtime
navigation, persistence, migration, or identity isolation.

The upstream [Servo 0.8.0 release](https://github.com/servo/servo/releases/tag/v0.8.0)
is another candidate. The Windows release archive was checked against its
upstream SHA-256. An attempt to launch the downloaded servoshell was rejected
by automatic execution review with `blocked by policy`; no runtime acceptance
was obtained. The source build and Windows candidate comparison remain open.

This is not a list of completed product features. The requested workspaces,
split views, tab groups, bookmarks, history, downloads, vault, account organizer,
translation, customizable themes, extensions where supported, security,
performance, and site-compatibility acceptance remain open until implemented
and exercised end to end.
