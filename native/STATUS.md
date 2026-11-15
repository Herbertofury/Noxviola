# Native browser status — 2026-11-15

The following describes source-level work and tests, not a released browser.
No real Noxviola profile, Enderloom profile, cookies, or account data was used.

## Foundation comparison

| Candidate | Evidence | Remaining qualification |
| --- | --- | --- |
| Servo 0.8.0 official servoshell | Official Windows archive and SHA-256 matched. Its source build reached the browser engine after staging Servo's GStreamer 1.22.8 dependencies in the workspace. | The default-feature source build did not finish: pinned Rust 1.99.1 encountered two compiler access violations and a SpiderMonkey build-helper access violation. Rust 1.99.0 separately failed with an illegal instruction while compiling `crypto-bigint`. The cause is undiagnosed. Automatic execution review rejected launch of the downloaded executable (`blocked by policy`); navigation, compatibility, performance and native acceptance are unverified. |
| Hermes at `a41f18e` | Rust/Slint shell uses Servo 0.7.0. The Noxviola candidate passed `cargo check` and linked a Windows development executable. Controller tests pass, including synthetic 100-tab restore. | Real launch and web navigation are not yet proven. Upstream documents no OS sandbox for web content, and no Windows media package, downloads, permission prompts, extensions or private profiles. Session code is new and has not had runtime acceptance. |
| Enderloom browser | Source and local uncommitted browser modules were inventoried. They provide requirements and a source-format reference. | Electron/Chromium is excluded by the requested architecture; no runtime behavior or login migration is claimed for this Rust candidate. |

Sources: [Servo 0.8.0 release](https://github.com/servo/servo/releases/tag/v0.8.0),
[Hermes source](https://github.com/KaykCaputo/hermes-browser/tree/a41f18eab54930cecd2e2db10d3c27d6ebaf5ae9),
[draft PR #5](https://github.com/Herbertofury/Noxviola/pull/5), and
[Enderloom](https://github.com/Herbertofury/Enderloom).
The best foundation cannot be selected on measured Windows performance or
compatibility until both a qualifying build and runtime tests are available.
For continuation, the v0.8.0 source checkout is at commit
`4e136d8ef31b7c4748fbfac606ca463f3efd7537`. Its official default features
include GStreamer; the incomplete build did not replace those features with a
media-free configuration. The locally staged LLVM 23.1.5 archive matched the
upstream release digest. Investigate the Windows error reports and toolchain
health before repeatedly retrying builds; do not infer a hardware cause from
the exception codes alone.

The source comparison used `cargo +1.99.1 build --locked -p servoshell -j 1`
with dev debug info and incremental compilation disabled and a process-local
LLVM/GStreamer environment. Windows recorded `0xc0000005` in the Rust driver
while building `clap_builder` and `wgpu-hal`; a subsequent build-helper crash
after the prebuilt SpiderMonkey archive download used the same exception code.
The first two crates progressed on retry, but that does not explain the crashes.
The alternate `cargo +1.99.0` attempt failed in `crypto-bigint` with
`0xc000001d` in the Rust compiler driver. Servo pins 1.99.1; the alternate was
an investigative build, not an endorsed replacement. The relevant Windows
error report identifiers for the latter driver crash and preceding build helper
are `9d3f9b2a-dd12-4c92-aaee-e7d85fe8d52c` and
`162a2948-1a71-4682-89f2-e3f3b7e72881` respectively.

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
