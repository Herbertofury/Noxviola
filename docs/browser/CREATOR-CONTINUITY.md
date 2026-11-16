# Creator Continuity

Creator Continuity is a premium-quality capability in Noxviola’s existing Following center. It connects dated author-status evidence, reviewed moves between mod sites, and ongoing destination version/file observations. It does not introduce billing, a paid entitlement claim, a new account requirement or an Athena runtime dependency.

## Creator hub extension

The [creator hub](CREATOR-HUB.md) now adds default-on local following from supported completed downloads, exact provider creator discovery, complete author catalogs, search/filtering, a review inbox and reversible unfollows. Its [current validation receipt](CREATOR-HUB-TESTS.json) supersedes the earlier portable test count below. Canonical corrections, retractions and unresolved mappings now hold new/resumed migration decisions; the canonical-to-tracking adapter remains a promotion gate.

## Use it

1. Open **Following**. Add an original mod page or author profile, such as `https://www.nexusmods.com/profile/SethSaidThat` or the original Nexus page for Estates of Skyrim.
2. Choose **All sources & evidence**. The source card shows known status evidence, its observation date, linked author profiles and exact mod candidates. Bundled evidence is identified as a verified source observation; imported evidence is labeled **user supplied**. Historical evidence older than seven days is visibly marked for rechecking.
3. For supported Nexus authors, choose **Refresh author status**. **Check author status hourly** opts that followed source into periodic public profile checks while Noxviola is open. Pausing/archiving the source stops its checks. A newly observed ban produces one browser notice within the relevant browsing identity; unchanged checks do not repeat it.
4. Expand a migration candidate. Review both original and destination mod pages, author, game, variant and requirements. Check the review box, then choose **Follow this mod on the new site**. This creates or reuses an exact destination follow, enables hourly public metadata checks and performs its first check. The original follow stays saved.
5. Use **Pause**, **Archive source**, **Restore source** or **Undo migration tracking** as needed. Undo archives a newly created destination while retaining its observations. If the destination was independently followed before the migration, undo restores its prior settings instead. No installed mod, provider account, mod manager or downloaded file is modified.

The bundled first example has two **review-required candidates**, Estates of Skyrim and Word Travels. Author identity is supported by the ModHold profile’s link back to the exact Nexus profile; same-title publication is not promoted into an automatically verified per-mod relocation declaration. There is no automatic source switching based on author name or title.

## What is checked

| Surface | Behavior and evidence boundary |
| --- | --- |
| Nexus author profile | Fixed public `/profile/{handle}` endpoint, no session cookies or credentials, redirects rejected. The exact heading and same-row avatar must identify the author. The avatar’s provider account ID is pinned, including the verified first-run seed ID. Only Nexus’s adjacent `nxm-pill-danger` / `nxm-pill-label` Banned badge produces a banned observation. |
| Available profile | A recognized header without the badge records **profile available**. It does not claim a moderation decision was reversed. Prior differing status observations remain in local history. |
| Access failures | HTTP 403/404/410/429, sign-in pages, a different account, malformed/oversized markup and changed layouts remain errors/unknown. Previous verified evidence stays visible. Provider Retry-After pauses persist. |
| ModHold | Its documented public `/api/v1/mods/{id}` JSON endpoint supplies exact project ID/game, canonical page, author handle, page version and current file IDs/versions/names/SHA-256/size. The parser enforces the project/game/page and pinned author before accepting a complete snapshot. |
| Update changes | File identity is the provider file ID; page identity is the project ID. Version/hash/name changes become unread revisions. Downloads, votes, views and scanner refresh times do not generate fake updates. Missing current files remain in saved history with the existing snapshot-presence marker. |
| Downloads and compatibility | No archive is downloaded or installed. File hashes are reported provider metadata, not a local verification result. A changed version is not permission to install, overwrite a customized mod or infer compatible dependencies/runtime. |

ModHold dates are kept exactly as provided. Its observed SQL-style timestamps do not carry an explicit timezone, and the UI does not invent one. A separate on-device observation time is always retained.

## More authors and sites

The feature is not a universal web discovery service. The initial registry establishes the requested example; additional authors/moves can be supplied through **Import creator evidence** in Following. The format is [shared/creator-continuity.v1.json](../../shared/creator-continuity.v1.json), shared byte for byte with the corresponding ModHunter/MO2R feature.

Imports are validated as a complete version-1 registry, limited to a 4 MiB transport budget with whole-import rejection rather than truncation, and stored only in the selected browser identity. A new registry never changes an existing follow’s destination. Imported status assertions remain labeled user supplied until a supported live primary check establishes a fresh observation. Every migration requires review even if a document sets `reviewRequired` to false. Replacing author evidence cannot inherit the old bundled author’s migration mappings.

Review tokens bind both the exact migration and author evidence. If either changes while a card is open, the service rejects the old decision and asks for current review. Active conflicting destination mappings must be undone before replacement. Destination metadata currently supports ModHold plus the existing supported Following providers; unsupported destination adapters remain visibly unavailable rather than pretending to track updates.

New site status parsers require their own primary-source identity/status contracts. Registry-only authors on other sites still have dated evidence and migration review, but no claimed automatic ban detection. Checks are periodic snapshots while the browser is running, not a complete record of every event that can occur between checks.

## Architecture and privacy

- `browser/follows.cjs` remains the canonical owner of persistence, browser identity, pending work, hourly scheduling, revisions and last-good snapshots. The existing atomic checkpoint/recovery lifecycle is reused.
- `browser/creator-continuity.cjs` validates and indexes registry source identities, assembles dated notices and verifies migration decisions. URL indexes avoid scanning every registry record for each displayed follow; repeated views reuse compiled indexes until the relevant imported registry object changes.
- `browser/nexus-author-status.cjs` fetches a fixed supported primary profile and parses inert markup with pinned `parse5 8.1.1`. No page JavaScript executes, images are not loaded and no hidden browser session is reused. `entities 9.0.0` is its existing locked transitive dependency; notices ship with production dependencies.
- `browser/modhold-follow.cjs` retains the existing public provider and complete author-catalog path. Its `browser/modhold-project.cjs` helper performs one conditional public metadata request per exact project. Existing provider IDs, source URLs, item IDs, fingerprints and stored numeric file sizes are preserved. The API contract comes from captured real responses, not an inferred schema. Unknown payloads fail the complete check.
- Source status, imports, accepted/revoked decisions, archives, original URLs and observations stay in the existing local `browser-follows.json` store. No author list or installed-mod list is uploaded to a central service.
- Pause, registry replacement, undo and disposal invalidate pending work; late responses cannot reactivate canceled tracking. Provider cooldowns are independent from GitHub/Modrinth/ModHold metadata cooldowns.

## Initial continuity checkpoint verification on 2026-11-16

The [portable validation receipt](CREATOR-CONTINUITY-TESTS.json) records **515 passed, zero failures/skips**, **116 JavaScript syntax files checked**, and a clean `git diff --check` against this feature branch. Focused regressions cover exact mod and author identity, current-review tokens, unrelated titles/IDs, explicit hourly consent, duplicate suppression, transient failure retention, pinned account reuse, fake Banned words outside the header, oversized/malformed responses, cancellation/undo/restart, identity-local imports and actual production renderer DOM actions through jsdom.

[Live primary-source receipt](CREATOR-CONTINUITY-LIVE-CHECK.json) records successful execution of the production collectors under Node 24.22.1:

- ModHold project **11**, Estates of Skyrim: page version **0.1.21**, **4 current files** plus the page observation.
- ModHold project **4**, Word Travels: page version **1.3.4**, **3 current files** plus the page observation.
- Nexus profile **SethSaidThat**: **Banned**, stable provider account **199502561**, parsed from the author’s actual profile header. No moderation reason was established.

These are point-in-time facts, not perpetual guarantees. The live collector route used this execution environment’s configured network proxy, without application credentials or website cookies.

[Visual/runtime attempt](CREATOR-CONTINUITY-UI-CHECK.json) is explicitly **blocked**. System Chromium aborted before opening a page because `socket()` was denied by the environment. That route was not retried through an alternate privilege/sandbox configuration. The DOM suite establishes production markup and renderer behavior; it does not establish native visual appearance, Electron IPC isolation, Windows packaging or packaged restart. Existing native/PR acceptance holds remain open.

## Primary references

- [Nexus profile and primary status](https://www.nexusmods.com/profile/SethSaidThat)
- [ModHold author profile and linked identity](https://modholdmods.com/u/SethSaidThat)
- [ModHold public API documentation](https://modholdmods.com/developers)
- [Estates of Skyrim public metadata](https://modholdmods.com/api/v1/mods/11)
- [Word Travels public metadata](https://modholdmods.com/api/v1/mods/4)

The metadata fixtures retain only fields used by the adapter. Mod descriptions, changelog bodies, covers, credentials and downloaded mod files are excluded.

## Concurrent browser work preserved

The initial continuity checkpoint was rebased onto browser commit `28cb18aacf515474331d5259610a974f47c491e1`. Its ModHold author-catalog adapter and Modding-Knowledge source-continuity report consumer are retained, including all existing tests and native-driver additions. Imported shared transition reports keep their attribution, retraction/conflict handling and review-only behavior; the new local registry and primary Nexus collector do not rewrite those reports. A regression compares previous project/file snapshots with the stricter collector and requires unchanged fingerprints/read states without duplicate observations.

The creator-hub amendment subsequently rebased onto `ebe412a91cee535fed1710a28f13ea426de3be6f`, preserving the newer nested-pane work. The current combined-tree proof is recorded in `CREATOR-HUB-TESTS.json`.
