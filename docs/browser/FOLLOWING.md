# Following: one browser, an informed user

Requested 2026-11-16. Flagship/premium-quality capability, not a new paid entitlement or billing flow. Noxviola must follow creators and projects independently of Athena; shared research, connector contracts and proven techniques must not introduce an Athena runtime requirement.

## Implemented checkpoint

Open **Tools → Following**, or the native browser menu. Add a named creator/project with an HTTPS source. The watchlist is scoped to the browser identity and saved locally using the browser's existing atomic checkpoint and explicit recovery service.

- GitHub repository URL: public release metadata (including prereleases) **and current Git tags** from separate paginated endpoints. Tag records include the source commit hash; moved tags become unread again. The tags endpoint supplies no publication timestamp, so only the local observation time is shown.
- GitHub owner URL: public repository discovery and latest repository activity metadata. This is not a commit-by-commit event stream or a claim to discover every associated social account.
- Modrinth project URL: public per-version metadata with same-version loader/Minecraft-version filters; see the Modrinth section below.
- Other HTTPS URLs: manual follow references, preserving query and fragment identity. They are explicitly labeled as manual, with no fake refresh or automatic tracking control.
- Native card library with search, creator/project/unread/paused filters, unread state, source and update opening, source freshness/error indicators, pause/resume and mark-read. Untrusted text is rendered as text, never HTML.
- Optional hourly checks while the browser is open; disabled by default. The scheduler wakes once per minute, prevents overlapping rounds and coalesces duplicate checks. Browser close cancels work. No server, background daemon, external notification enrollment or login is required.
- Every exposed pagination page is collected before a successful commit. Per-page ETags preserve complete cached page metadata on HTTP 304. A malformed/blocked/timed-out page keeps last-good results rather than reporting a partial success. Entries absent from the last successful snapshot remain saved and are visibly marked as not returned; absence is not proof of deletion; changed metadata for a stable item resets unread state.
- Pausing or changing controls cancels outstanding work and rejects its late result. Different browser identities cannot mutate one another's follows through service commands. Draft form ownership is retained across identity changes.

No website cookies, private account credentials, vault content or browsing history are sent. Requests go only to generated public GitHub or Modrinth API paths. Redirects are rejected; pagination is restricted to the same API origin and path. Opening a saved source/update uses ordinary browser navigation in its recorded identity. Files/assets are not downloaded or executed. Missing adapters remain visible and open work, not silent fallback to permissive arbitrary scraping.

## Fidelity and efficiency boundaries

This checkpoint stores titles, canonical links, source dates, observation/read state and a fingerprint of relevant description/release fields. It is **not** full release-note/source/asset archival or a version history of every changed metadata value. The creator endpoint does not establish every publication by that creator. No complete online-world coverage, universal social compatibility, benchmark speedup or zero-loss archival claim is made.

Direct public API collection avoids launching a second renderer for supported metadata tasks. Real smoke observation: `finktheartist` returned six public repositories on HTTP 200 and exactly the same six items on the next HTTP 304. This verifies the conditional-request path, not broad rate-limit, correctness or memory superiority. No CPU/RSS/p95 comparison was run.

## Obscura: useful optional addition, evidence-gated

The existing [source audit in issue #8](https://github.com/Herbertofury/Noxviola/issues/8#issuecomment-6918036368) evaluated engine revision `0d9a2f7` and benchmark `2d7bc30`. It found successful CDP no-op domains, rendering/frame gaps, and benchmark validity weaknesses. Its no-render headline is not evidence of identical-work full-browser superiority.

Obscura remains a candidate for an optional, separately isolated extraction process for sources needing execution. This is a helpful addition to Noxviola, not a browser-foundation replacement. There is no Obscura binary, installer, fabricated engine switch, detection-evasion feature, weakened sandbox or new privileged bridge in this checkpoint. Require explicit supported-capability errors and test identical expected extracted content, all pagination, access failures, cancellation, total process-tree resources and fidelity before promoting any adapter. Use supported APIs/feeds before additional rendering. No access-control bypass is authorized by this design.

## Evidence and next gates

Portable service tests cover persistence/recovery, duplicate IDs, identity isolation, unsafe pagination, ETags, failure retention, cancellation, timeout and scheduler overlap. Production renderer contract tests cover truthful manual status, escaped content, filtering, scoped commands and failed-save draft retention. Packaging explicitly includes the new service.

A native acceptance test was added for actual form submission, honest manual status, screenshot capture and a real process restart retaining the source/pause state. It has **not run locally**: the clean native preflight reports no Linux desktop DISPLAY/WAYLAND_DISPLAY. Hosted exact-commit CI must establish its result. DOM tests are not native visual/interaction acceptance.

Open work: feed/social adapters; verified cross-platform creator/project identity resolution; full release/changelog/version/compatibility tracking; natural-language intake; update diff/history; reviewable notification delivery; complete archival/export and rights-aware reusable assets; Obscura isolated equivalent-task experiments; native accessibility/visual and scale/resource qualification. Preserve accepted full-browser parity and all existing holds. Athena can share methods and test contracts, never a required service for these controls.


## Freshness and tag follow-up · 2026-11-16

Research distinction: this implementation uses `/users/{owner}/repos`, **not** GitHub Events. The [Events API](https://docs.github.com/en/rest/activity/events) has a bounded 300-event/30-day timeline and can lag up to six hours. Those limits must gate any future Events adapter, but must not be incorrectly attached to the current repository-list responses. Repository lists are snapshots too: they cannot recover every intermediate change or undiscovered publication.

The [releases endpoint](https://docs.github.com/en/rest/releases/releases) omits ordinary Git tags without a release. The follow-up collects both releases and the [repository tags endpoint](https://docs.github.com/en/rest/repos/repos#list-repository-tags), follows all returned pagination, and independently revalidates each page. No commit history, deleted-before-observation tags, private data or full audit-history coverage is claimed. Previously saved metadata remains readable, including old cached releases without the new optional fields.

Following now exposes coverage text, unchecked/failed/checked/overdue state, observation versus source dates, and retained items absent from the latest successful snapshot. A successful current snapshot does not prove no gaps occurred while the browser was closed or between checks.

Following applies GitHub’s [polling and rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api): `X-Poll-Interval` sets a durable source-specific minimum, including on 304; `Retry-After` and an exhausted `X-RateLimit-Reset` set a durable provider-wide pause. Manual refresh cannot override them. Requests from different follows are serialized through the state commit, preventing a queued request from racing past newly received backoff. Malformed or partial collections retain timing directives as well as last-good data. No credentials or webhook permissions were added; unauthenticated ETags are **not** claimed to eliminate rate-limit usage.

Live public Sakuga check: both endpoints returned 200, then 304; both snapshots contained zero public releases/tags. This is a truthful empty observation, not a proof that the project has no versions. Synthetic tests cover nonempty bare tags, tag moves, pagination and mid-collection failure. See `FOLLOWING-TAGS-LIVE-CHECK.json`. No general memory/CPU superiority measurement is claimed.

## Modrinth project versions · 2026-11-16

A standalone `modrinth-versions` adapter now accepts Modrinth project pages for mods, modpacks, shaders, resource packs, data packs and plugins. It resolves a project slug to a durable project ID before collecting versions, then uses that ID on subsequent checks. Existing manually saved Modrinth references remain manual until the user explicitly enables the adapter; enabling it does not automatically enable hourly requests. This is a local browser follow, not a Modrinth account follow.

The [official versions operation](https://docs.modrinth.com/api/operations/getprojectversions/) returns version-level loaders and Minecraft versions. Noxviola preserves each version’s own arrays and stable ID. Both selected filters must match **the same returned version**; a Forge release for 1.19.2 plus a Fabric release for 1.20.1 never implies Forge 1.20.1 support. The library displays each version’s declarations and allows persistent per-source filter edits. An absent-from-current-snapshot record remains saved but does not count as a current match. This is declared metadata, not verification of dependencies, runtime, environment or modpack interoperability.

The request uses `include_changelog=false`, as recommended for version inventories. Full changelogs, dependency resolution, author discovery and version files are not collected or downloaded in this checkpoint. No silent row cap is applied: the entire returned list must validate. Responses above a 16 MiB body budget fail visibly before committing any partial result. This is an explicit resource boundary, not a complete-source archival claim.

[Modrinth’s API overview](https://docs.modrinth.com/api/) specifies relative-seconds rate-reset headers, unlike GitHub epoch resets. Modrinth’s retry/rate-limit pause is saved separately so it cannot block unrelated GitHub checks. All requests use the fixed API origin, an identifying Noxviola User-Agent, no credentials/cookies and no followed redirects. Conditional requests are used when an ETag is actually supplied; a server returning 200 again is not described as a 304 bandwidth saving.

Live public smoke check resolved Sodium to `AANobbMI`, collected 272 versions, and received the identical list on a repeat 200 response. It found 13 versions declaring both Fabric and Minecraft 1.20.1, and zero declaring Forge and 1.20.1. These are returned-metadata counts, not proof of unsupported platforms or runtime compatibility. See `FOLLOWING-MODRINTH-LIVE-CHECK.json`. This test establishes no SPMovesets identity or Modrinth presence.

## Observed revision history · 2026-11-16

Changed fingerprints now preserve the previous supported metadata with its observation and replacement times. Unchanged checks do not append duplicate revisions. History is identity-scoped, survives restart and remains on failed checks; current read/unread behavior is unchanged. Existing saved items without history remain valid. A newly observed title, tag commit or version declaration can be compared in the native Following panel by expanding its revision history.

Historical fields render only when expanded, avoiding eagerly constructing every revision's DOM nodes. Values are text, not executable markup. There is no silent revision cap. This adds durable storage cost proportional to observed changes; no measured performance speedup is claimed. Full metadata validation and atomic save behavior are retained.

This is not complete history: only changes observed by this browser are captured. Source dates are distinct from observation/replacement times. Full release bodies are not retained, so a fingerprint-only change explicitly says the changed source content was not saved. Changes before this feature, between polls or created/deleted while offline cannot be reconstructed. CurseForge remains manual and its staged collector is not connected to this history store.

## ModHold public metadata · 2026-11-16

The independent ModHold adapter accepts project pages and `/u/handle` author profiles. The [official developer API](https://modholdmods.com/developers) provides public metadata without keys; authenticated downloads are a separate workflow and are not used here. Project checks read the project and all returned file metadata. Author checks traverse every public catalog page and match the case-folded handle exactly, without undocumented author filters or broad-name matches. That can require multiple catalog requests; this is not every author post or every file. Empty author matches do not prove the author has no work elsewhere.

Fixed public HTTPS API routes, omitted cookies, refused redirects, body budgets, pagination/duplicate checks, cancellation, independent durable provider cooldown, identity-scoped persistence, last-good retention and observed revision history apply. Files keep their names, version, type, size and declared SHA-256. No binary is downloaded, installed or verified; scan timestamps are not represented as release dates. Popularity counters are excluded from fingerprints to avoid false update noise. Existing manual references require explicit adapter enablement; hourly checks remain separately opt-in.

Live production-collector check retrieved Octavia project8 plus seven files with one request and 36 SethSaidThat catalog projects across three requests. Evidence: `FOLLOWING-MODHOLD-LIVE-CHECK.json`. These are provider-returned metadata observations, not a cross-site identity, ban, relocation or moderation-cause verdict. No access grant or key was created. Native form/restart assertions are added; hosted results remain the native gate. No measured startup/RSS improvement is claimed.

### Relocation-warning evidence gate remains open

The premium warning must distinguish verified platform action, author-confirmed relocation, outdated/hidden project, transient error and unresolved identity. A 403/404, missing search result or same-looking handle is not sufficient evidence of a ban or its reason. Shared Modding-Knowledge integration, evidence review and actual warning delivery are not implemented by this adapter. Nexus obsolete-project replacement is not a ban. Tracking a public destination can work independently while cross-site allegations remain unverified.
