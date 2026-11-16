# Creator hub and automatic local follows

The Following panel now centers on creators, their followed projects, new public catalog discoveries, update history and evidence that needs review. This extends [Creator Continuity](CREATOR-CONTINUITY.md) on the same browser feature branch and the same identity-local Following service. It does not introduce a website account, social follow action, billing flow or installation action.

## The user workflow

Open **Tools → Following**. The creator hub provides four overview counts, creator/project views, a complete update timeline, a review inbox, and the detailed source/evidence view. Search matches creator names, linked projects and update titles. Site, unread, paused, attention and archived filters can be combined with recent-activity, unread-first or alphabetical ordering.

Creator cards show the provider identity, the metadata relationship that established it, linked followed projects, the latest observed update, and public projects discovered in that creator's catalog. Expanding a catalog exposes every returned project; it does not install or silently follow them. **Follow project updates** uses the exact saved provider item. New project follows retain their link to the creator.

The update timeline displays every matching saved update in interruptible render batches. **Mark read / Mark unread** changes one exact source item; source-level mark-all controls remain available. Source dates and on-device observations remain separate. Existing revision history, absent-from-current-snapshot markers, rate-limit errors and original source addresses are retained.

**Automatically follow downloaded creators** is on by default in each browser identity, as requested by the owner. A stored opt-out always wins. The native download manager captures the initiating frame/page and sanitized download URL chain synchronously in `will-download`; only its native `done(completed)` outcome triggers discovery. Progress getters, failed choosers, cancelled downloads and terminal interruptions cannot trigger follows. Navigating the tab or switching identities after the download starts does not change the recorded owner or page.

Successful exact discovery creates local creator and project follows with hourly public update checks while Noxviola is open. Existing follows keep their pause, automatic-check, read and history choices. Unresolved downloads get a review entry with the preserved public source and a useful next action. The filename is only a display label.

**Find creators in saved projects & downloads** is an explicit backfill action. It considers active saved project references and completed download records in the selected identity. Nothing is backfilled automatically on startup. If automatic following is off, explicit discovery can still collect review candidates, but the user must choose a creator before adding follows. A project with several credited team members always requires a choice.

### Provider coverage

| Source | Exact discovery proof | Follow identity and update coverage |
| --- | --- | --- |
| ModHold download | Captured initiating project URL supplies game/project ID; `/download/{fileId}` or the documented file-download endpoint in the native URL chain must refer to a file currently returned by that exact project's public metadata. No download endpoint is requested by discovery. | Public project author handle and canonical ModHold profile. Page/file versions are tracked independently; a complete public catalog supports discovering that handle's other projects. |
| Modrinth download | The exact CDN file URL must appear in exactly one version of the immutable project ID. That version's `author_id` is resolved through the public user endpoint. An available originating project must agree. | Stable Modrinth account ID, described as **publisher of the downloaded version**, not an inferred sole project owner. Public projects credited to the account form its creator catalog. |
| Saved Modrinth project | The exact project resolves to a stable project and team ID. Public accepted members must belong to that team. Multiple credited members require explicit selection. | Each selected stable account gets a separate creator follow. A display name or team ordering never selects an owner. |
| GitHub release/archive | A recognized GitHub/codeload repository download path identifies the exact repository. Public repository metadata confirms its numeric repository ID and owner ID. | Stable numeric account and repository/owner pins. Subsequent collection verifies those pins before retaining new repository/release observations; account reassignment, repository replacement, changed ownership and mismatching returned owner IDs become visible retained-data errors. |
| Nexus download or saved mod | The exact originating Nexus project page is retained when available. This browser has no existing credential-free project-to-uploader adapter or authorized Nexus key integration. | Explicit **uploader identity not verified** review entry with the original project link. The user can follow a confirmed profile manually. Existing primary Nexus author-status checks remain independent and functional. |
| Other or incomplete provenance | No supported exact provider/file relationship is established. | Review only. The user can provide a reviewed, exact supported project page or dismiss the discovery. No author is inferred from a filename, page title or matching display name. |

The observed ModHold API exposes a handle/profile identity rather than an immutable numeric user ID. It cannot establish whether an otherwise indistinguishable handle was reassigned. The UI and receipts describe that profile-bound evidence; no stronger account-reassignment detection or cross-site name matching is claimed. Modrinth and discovered GitHub identities use their provider IDs.

## Control, persistence and recovery

- **Pause / Resume** controls a source's checks. Creator catalogs and independently followed projects keep separate settings.
- **Unfollow** archives the source, stops its checks and stores a durable tombstone for its exact identity. Repeat downloads, pending lookups and catalog actions cannot silently re-add it. Unfollowing a creator stops its catalog and future automatic discovery of that creator; separately followed projects retain their own controls.
- **Undo unfollow** explicitly clears that source's tombstone and restores its previous settings. Metadata/read/history remains saved throughout.
- **Dismiss / Restore review** controls a discovery record without deleting downloads or existing follows. A late response cannot overwrite a dismissal.
- **Undo migration tracking** retains its prior behavior: restore an existing independent destination's settings, or archive a newly created destination while keeping history.
- A preference change invalidates pending automatic discovery. Disposal cancels network work. Before committing a response, discovery checks the original identity, request token, current preference generation, explicit unfollows and any existing pinned identity.

`browser-follows.json` remains the single atomic store. New optional fields hold preferences, discovery/review history, exact creator links and unfollow tombstones. Previous stores remain valid; they do not silently replay old downloads. `browser-downloads.json` gains optional initiating-page/URL-chain provenance for future backfill. Recovery and external-writer checks are unchanged.

Only public canonical addresses are added to discovery records. Credentials, signed query strings and fragments are stripped from this new provenance projection. No local downloaded file contents, file path, browser cookie, account token, vault or browser history is sent to the metadata service. The existing download history's own saved URL behavior is unchanged.

## Complete catalogs without per-author network multiplication

`browser/modhold-follow.cjs` separates `collectCatalog()` from exact-handle `forAuthor()` projection. The full public catalog must finish and validate before any shared snapshot becomes usable: page numbers, stable totals, stable page size, all expected rows, canonical project IDs and duplicate detection remain enforced. There is no page or project count cap. A changed, partial, cancelled, malformed or failed scan cannot populate the shared snapshot.

The Following service reuses one complete successful snapshot **per browser identity for the hourly check window**, then filters by exact normalized handle for each creator. Each source stores its actual `catalogObservedAt`; scheduling is based on that retrieval time. Reusing a snapshot cannot advance the provider observation time. Explicit **Check now** requests a fresh catalog while still obeying provider cooldowns. A failed fresh request retains prior source observations and read states.

The in-memory full snapshot is discarded at browser shutdown. Each saved author cache contains only that author's projected items. Independent identities do not share mutable snapshots. Catalog discoveries are labeled as public projects; they do not establish that a mod is downloaded, installed or compatible.

### Measured protected-work comparison

The portable regression runs the same complete synthetic **150-project, 12-author, three-page** workload through the previous per-author collection route and the shared-snapshot route, including durable service commits. It requires identical saved project observations and complete results.

| Metric | Previous route | Shared snapshot |
| --- | ---: | ---: |
| Provider requests | 36 | 3 |
| Catalog response bytes | 12 copies | 1 copy |
| Saved project observations | 150 | 150 |

These are deterministic request/response-byte measurements with a synthetic public-provider transport. They are not a browser startup, network latency, CPU/RSS or universal performance-superiority claim. Creator-to-project and source-ID indexes also avoid repeated full-list searches in the hub projection. No result, field validation, pagination page or history is discarded for these savings.

## Canonical source-continuity boundary

The established Modding-Knowledge PR #6 `schema_version: 1` consumer remains unchanged and review-only. Canonical imports retain their exact records, attribution, source-bound correction history, conflicts, expiry, retraction and supersession. The app-local `creator-continuity-registry` remains a notice/candidate projection with the same bundled seed as the corresponding ModHunter/MO2R feature; it does not replace that canonical interchange contract.

This extension adds a conservative decision hold: relevant canonical reports saved on either the mod or author profile are considered before starting or resuming migration tracking. Retractions, supersession, expiry, conflicting copies, equal-time contradictory copies, corrected status, changed destination identity and absent/unverified/different exact project mappings block the action and show review text. The service checks the hold again when the action executes, so an old open card cannot bypass a new correction. Original sources and existing observations remain available, and undo remains possible.

Canonical records still do not automatically generate the local registry or tracking decisions. A complete canonical-report-to-tracking lifecycle adapter, including explicit resolution policy and verified cross-product synchronization, remains a promotion gate. Fresh primary Nexus status observations and ordinary independent creator follows do not rewrite canonical report history.

## Current browser integration

This amendment was rebased onto browser target `ebe412a91cee535fed1710a28f13ea426de3be6f`, retaining its nested native panes, independent pane identity/address controls, split-unit behavior, pointer geometry assertions and native fixture cleanup. Overlapping renderer declarations, CSS, tests and the packaging allowlist include both features. The target's pane service, preload/state changes, native drivers, pane tests and `MULTI-PANE.md` remain unchanged. `TODO.md` is inherited unchanged from that exact target and is excluded from the feature publication payload.

## Verification and remaining gates

- [Portable receipt](CREATOR-HUB-TESTS.json) records the final full service, renderer DOM, package-source and syntax checks for this amendment.
- Event-path regressions use the production `DownloadManager`, its actual `will-download`/`done` handlers, the production completion bridge and real persistent Following service with a synthetic native `DownloadItem`. They cover successful completion, false progress completion, duplicate completion, chooser failure, cancellation, interruption, navigation/profile changes, opt-out, duplicate/coalesced lookups, tombstone races, dismissal, restart and disposal. This is not a claim to have executed Electron's native download engine.
- Production DOM tests cover creator grouping/search/filtering, exact identity-bound controls, late preference completion after identity switches, retained failed review drafts, all **407** timeline records, all **67** on-demand catalog entries, single-item read actions and blocked migration UI. The renderer uses text nodes for untrusted metadata and no network avatars.
- [Live public-metadata receipt](CREATOR-HUB-LIVE-CHECK.json) separately exercises exact ModHold authors, Modrinth project teams/version publishers, GitHub owners and the complete ModHold catalog. A known public file URL used as synthetic provenance is explicitly labeled; no file download or native completion is claimed.
- The prior [Chromium runtime attempt](CREATOR-CONTINUITY-UI-CHECK.json) remains **blocked before page load** by the environment's denied `socket()` call. No alternative privilege/sandbox route was attempted. Responsive CSS and semantic native controls have portable DOM coverage; native visual, keyboard/accessibility, Electron IPC, installed-package restart and full browser acceptance still require a supported native host.

No PR was merged and no release gate was relaxed. Prior successful hosted contracts and preview packaging belong to their exact commits; new commit results must be checked separately.

## Primary contracts

- [Electron Session `will-download`](https://www.electronjs.org/docs/latest/api/session)
- [Electron DownloadItem lifecycle and URL chain](https://www.electronjs.org/docs/latest/api/download-item)
- [ModHold public API](https://modholdmods.com/developers)
- [Modrinth stable IDs](https://docs.modrinth.com/api/)
- [Modrinth project members](https://docs.modrinth.com/api/operations/getprojectteammembers/)
- [Modrinth version file and publisher metadata](https://docs.modrinth.com/api/operations/getversion/)
- [Modrinth user projects](https://docs.modrinth.com/api/operations/getuserprojects/)
- [GitHub users](https://docs.github.com/en/rest/users/users#get-a-user)
- [GitHub repositories](https://docs.github.com/en/rest/repos/repos#get-a-repository)
