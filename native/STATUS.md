# Native browser status — 2026-11-15

The following describes source-level work and tests, not a released browser.
No real Noxviola profile, Enderloom profile, cookies, or account data was used.

## Foundation comparison

| Candidate | Evidence | Remaining qualification |
| --- | --- | --- |
| Servo 0.8.0 official servoshell | Official Windows archive and SHA-256 matched. Source build in progress. | Automatic execution review rejected launch of the downloaded executable (`blocked by policy`); navigation, compatibility, performance and native acceptance are unverified. |
| Hermes at `a41f18e` | Rust/Slint shell uses Servo 0.7.0. The Noxviola candidate passed `cargo check` and linked a Windows development executable. Controller tests pass, including synthetic 100-tab restore. | Real launch and web navigation are not yet proven. Upstream documents no OS sandbox for web content, and no Windows media package, downloads, permission prompts, extensions or private profiles. Session code is new and has not had runtime acceptance. |
| Enderloom browser | Source and local uncommitted browser modules were inventoried. They provide requirements and a source-format reference. | Electron/Chromium is excluded by the requested architecture; no runtime behavior or login migration is claimed for this Rust candidate. |

Sources: [Servo 0.8.0 release](https://github.com/servo/servo/releases/tag/v0.8.0),
[Hermes source](https://github.com/KaykCaputo/hermes-browser/tree/a41f18eab54930cecd2e2db10d3c27d6ebaf5ae9),
[draft PR #5](https://github.com/Herbertofury/Noxviola/pull/5), and
[Enderloom](https://github.com/Herbertofury/Enderloom).
The best foundation cannot be selected on measured Windows performance or
compatibility until both a qualifying build and runtime tests are available.

## Requested feature tracking

| Area | Current evidence / next gate |
| --- | --- |
| Navigation and tabs | Hermes has source-level multi-tab navigation; native site loading remains unverified. |
| Session and recovery | Rust session library and shell controller have synthetic restart/100-tab tests. The shell supplies Servo a dedicated experimental engine storage directory; actual cookie and site-storage persistence, process restart and recovery UI remain unverified. |
| Named identities | Metadata exists; separate browser storage and network isolation are not established. Do not treat labels as isolation. |
| Enderloom migration | Read-only parser preserves raw selected JSON bytes and unknown values; no integrated import workflow, cookie migration, or authenticated-session migration. |
| Branding and UI | Owner's fox icon and compact purple Slint theme compile; visual and accessibility acceptance are unverified. Vertical tabs and customization remain open. |
| Workspaces, split views, groups | Not implemented in this candidate. |
| Bookmarks, history, downloads, vault, accounts | Not implemented in this candidate. Original Electron draft and Enderloom data remain untouched. |
| Search, translation, blocking | Hermes includes address/search and a content-blocking implementation in source; Windows end-to-end behavior is unverified. Translation remains open. |
| Themes, extensions, shortcuts | Some Hermes shortcuts exist in source. Themes, extension support and end-to-end acceptance remain open. |
| Security, compatibility, performance | No security qualification, real-site compatibility suite, cold/warm timing, resource measurements, or 1/10/50/100-tab runtime benchmark has passed. |

Only synthetic fixtures belong in public source and CI. Never publish local
profiles, credentials, account records, browsing history or vault contents.
