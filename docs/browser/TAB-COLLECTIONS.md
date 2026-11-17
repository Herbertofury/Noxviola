# Tab Collections: full parity goal, measured first implementation

## Product goal and status
Premium local tab collection manager in both the sidebar and full browser view, ultimately matching and exceeding OneTab and comparable tab managers. Huge libraries must stay compact, searchable, durable and responsive. There is no stored-record cap, but disk, memory, response budgets and hardware are finite. Never advertise unlimited crash immunity. Status: **partial implementation; not full parity or release qualification**.

The live browser now calls a Rust helper with bundled SQLite. Save current workspace HTTP(S) tabs belonging to the current identity; pinned tabs are opt-in. Save-only and durable-save-then-close are separate actions. URL/title/pin collection semantics are explicit: this is not preservation of page history, unsaved forms, cookies or arbitrary session state. A tab that navigated, moved workspace/group, or changed saved metadata during the transaction is retained. Internal/extension pages are not silently claimed as saved. Restore one tab retains the saved record. Identity changes during restore abort activation.

Both surfaces browse collections and their tabs, search within a collection using token prefixes, import OneTab URL/title text, star/lock and archive/unarchive collections. Archived data is retained; no destructive cleanup is implemented. Current import text becomes one collection; source blank-line grouping is not yet preserved. No auto sync, tracking or network requests occur for saved links; no remote favicon fetching.

## Storage and transport
- SQLite WAL, synchronous FULL, foreign keys, transaction rollback, version check, explicit errors instead of resetting unknown/corrupt data. Unix database and sidecars restrict access to the owner. Desktop OS account protection still matters; this is not encryption at rest.
- Indexed identity/collection/keyset pages; FTS5 title/URL token-prefix search. SQLite page cache budget 8MiB; real process overhead exceeds it. No whole-library JSON rewrite or renderer hydration.
- Responses bounded by both rows (50 collections/100 tabs) and approximately 1MiB encoded data, with continuation cursors and no discarded matches. UI replaces pages instead of accumulating cards.
- Per-operation IPC budget 8MiB, no permanent collection-count limit. Larger import transactions must currently be split explicitly; streaming import into a single collection remains open. One operation runs at a time; simultaneous surfaces may receive an explicit busy error, not silent queuing.
- Writes report success only after SQLite commit. Abrupt termination never triggers automatic retry of an uncertain mutation. No live tabs close on transport/storage failure.

## Primary-source comparison and code study (2026-11-17)
- [OneTab official help](https://www.one-tab.com/help): current scope includes folders, quick access, tasks/stars, multi-selection, reordering/merging, sharing, omnibox search, shortcuts and opt-in private tabs. It also describes encrypted sync/backup. These remain acceptance requirements, not an outdated small group-list-only target. Proprietary internals were not available or claimed inspected.
- [Session Buddy](https://sessionbuddy.com/): compare contextual restoration, historical recovery, duplicates, advanced filtering and multi-format interchange. These are parity obligations, not implemented claims.
- [Tab Session Manager source](https://github.com/sienori/Tab-Session-Manager/tree/113b272d6b5a2159f50181d1771163c20381ad6c): inspected `src/background/sessions.js` (IndexedDB openCursor accumulation in getAll) and `src/background/search.js` (loads id/windows for all sessions before constructing search info). This implementation deliberately uses indexed database queries and bounded transfer instead. No third-party implementation copied.
- [SQLite durability](https://www.sqlite.org/pragma.html#pragma_synchronous) and [Electron ASAR executable limits](https://www.electronjs.org/docs/latest/tutorial/asar-archives): helper is explicitly unpacked and launched from app.asar.unpacked, not spawned from inside the archive.

## Evidence and limits
`npm run build:collections` builds the pinned Cargo.lock Rust helper. `cargo test --locked --manifest-path native/tab-collections/Cargo.toml`, `npm test`, and `npm run check` cover the contracts. Additional helper tests launch the actual ASAR-unpacked executable, verify identity isolation, restart, rollback, byte-limited pages, file permissions, failed-save/no-close, navigation/workspace race, stale-identity restore, edited import preservation and abrupt process death. Actual power-loss/disk-full/hardware-failure testing is not represented by process-kill tests.

The checked-in [synthetic million-tab receipt](evidence/tab-collections-million-20261117.json) covers 1,000 batches/collections: ~24.6 seconds ingestion, 272MB database (~272 bytes/tab for this fixture), 100-row deep-page p95 0.87ms, parent event-loop p99 13.5ms, integrity check and restart passed. It is a local machine benchmark, not comparison with another product or native browser UX qualification. Parent RSS excludes the helper; no claim of total process memory is made. Re-run `node scripts/stress-collections.cjs 1000000` after relevant changes. No user data is used.

Native shell acceptance is still blocked locally by the absent display; no headless or disabled-sandbox substitute is counted. Hosted Windows/Linux runtime and packaged shell tests remain open. Packaging now refuses cross-target OS/architecture builds rather than accidentally shipping a host helper. Matching cross-compiled helpers/manifests remain a gate to restoring cross-target packaging support. Build on the target host meanwhile. Applicable bundled licenses are in `THIRD_PARTY_COLLECTIONS_LICENSES.txt`.

## Full parity backlog: stays open
1. Bulk restore with progressive/cancelable scheduling, lazy native tab instantiation and final preserve/delete behavior options; preserve browser group/workspace context and selected tabs.
2. Folders, arbitrary move/reorder/merge, multi-select, quick list, task state, annotations, saved filters and global/omnibox search.
3. Import/export round trips and streaming large single-collection imports, preserving OneTab group boundaries; JSON/CSV/Markdown/HTML formats, duplicates and explicit overwrite/merge policy.
4. Local backup, integrity/recovery UX, disk budget and compaction controls; optional E2EE sync with key lifecycle and explicit opt-in sharing. No automatic public exposure.
5. Keyboard shortcuts, accessibility and detailed visual/native acceptance, rich preview media, advanced sorting and lightweight progress/cancel controls.
6. Independent comparison across OneTab-style extensions and browser variants, low-memory/disk-full/power-loss tests, multi-instance concurrency and real-world large libraries; continually optimize without data/fidelity loss.
