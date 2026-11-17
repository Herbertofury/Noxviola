# Firefox password sidebar source audit — 2026-11-16

This is scoped installed-code evidence, not an inspection of the owner's Firefox profile or a claim that Noxviola has a password manager. Firefox 160.0's root `omni.ja` SHA-256 is `f86082bccd82ae9e976b7c51127a2cf55c7c1c16e166e46316e6f9b081d5041f`. Its optimized archive's central directory and local entries were read without changing the installation; extracted entries were verified against their declared CRC and size.

The shipped browser sidebar controller registers the contextual password manager as a selectable `viewCPMSidebar` whose content is `chrome://global/content/megalist/megalist.html`. The installed `SidebarManager.sys.mjs` includes passwords among the default launcher tools. This is a separate capability from Noxviola's Account Atlas.

| Shipped root-archive entry | SHA-256 | Observed role |
| --- | --- | --- |
| `modules/megalist/aggregator/datasources/LoginDataSource.sys.mjs` | `52245798e12176ea8ab8079381163425cce3c8dcd01358411729211d6727053a` | Coordinates login operations, file/browser import, CSV export, breach and sync integration, and OS authentication prompts for sensitive actions. |
| `modules/megalist/MegalistViewModel.sys.mjs` | `c8478b3a2a1dc3bc51607e3c5056e7c1fd443a88d4b165719cc6854c0d1b8d20` | Connects the sidebar view to its aggregate data model. |
| `chrome/toolkit/content/global/megalist/components/login-form/login-form.mjs` | `20d4b1ac3a7eed7444e75bb1a3b5832d8b5e2e866d825ed4c9723983a2abb595` | Implements login form and deletion-confirmation UI. |
| `chrome/toolkit/content/global/megalist/components/password-card/password-card.mjs` | `7012f437d8c9dfdb1fcd794517a0e09e87ae893f85b22b8a748686b63f54342a` | Implements password-entry display and actions. |
| `chrome/toolkit/passwordmgr/passwordstorage.sys.mjs` | `7a7d2fdbca9c22fbab5a223f2eec2126aceb725546b0c877e23082663a3bfbb6` | Initializes and selects or migrates Firefox's JSON and Rust login storage backends. |

Noxviola's existing `accounts.cjs` deliberately stores account labels, handles, origins, identity associations and user-supplied markers as plaintext metadata. It rejects password, token, cookie, TOTP and recovery-secret fields; the marker that a user says an account is saved in another password manager does not connect to or verify one. The sidebar account integration must retain that distinction and the identity boundary. Opening a metadata record can route its origin into its assigned browser identity, but it does not authenticate or autofill the site.

Full password-manager parity remains open: secure credential storage and retrieval, user authorization and reauthentication, login creation and updates, origin-scoped autofill, generated passwords, import/export, breach reporting, recovery and migration semantics, and independent security/runtime evidence are not supplied by the Account Atlas. Noxviola must not copy Firefox's telemetry instrumentation. Synthetic credentials and isolated profiles are required for future tests; no owner credentials were read in this audit.
