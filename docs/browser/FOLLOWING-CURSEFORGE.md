# CurseForge Following: staged, not live automatic tracking

## Current checkpoint · 2026-11-16

CurseForge sources remain identity-scoped manual references in the browser. Their coverage text now states the missing authorized API-key integration. The new `curseforge-follow.cjs` collector is tested with synthetic responses but deliberately is not connected to `FollowService` collection, UI credential entry, persistence or a background scheduler. No API key was obtained or used; no account/grant was created. Existing sources do not silently gain network access.

The official [API documentation](https://docs.curseforge.com/rest-api/) requires an `x-api-key` header and documents a 50-result page maximum and 10,000-result window. The staged collector validates project metadata against the requested URL, then traverses file pages. It rejects changed totals, duplicates, invalid/zero-progress pagination and the provider window rather than claiming truncated data is complete. Numeric IDs cannot become arbitrary request paths. Only fixed `api.curseforge.com` HTTPS endpoints receive the caller-supplied ephemeral key, with cookies omitted and redirects rejected. No key enters returned metadata or logs; transport failures are sanitized.

Cancellation and provider pauses are observed between requests and before returning; a 16 MiB per-response safety budget fails the whole collection explicitly. No snapshot reaches production storage yet. Production integration must preserve existing atomic last-good commits, identity ownership, deadlines and independent provider backoff. This contract is not a claim of transactional provider snapshots: concurrent changes that do not alter counts can still evade detection.

File display name, exact file name, numeric provider release type and provider label are separate fields. A name containing “beta” stays unchanged even when the provider says Release. Unknown release types stay Unknown. File-declared game-version strings are retained without deriving install compatibility, stable maturity or compatibility across different files. Changelogs, dependencies and binaries are not collected or installed.

## Real source evidence, not an authenticated API test

The public [SPMovesets file page](https://www.curseforge.com/minecraft/mc-mods/spmovesets/files/9634311) was read. It identifies project **1761617**, file **9634311**, exact file name `spmovesets-1.20.1-2.0-SU.jar`, Forge / 1.20.1, and provider Release label. These are website declarations, not an API response, execution test or maturity verdict. No Modrinth identity is asserted. The beta-vs-Release regression is a synthetic case, not an allegation about this particular file.

## Next required step

Select an explicitly authorized, reviewed credential mechanism scoped to CurseForge. Do not embed a shared key or put one into browser state/exports. Then wire the collector through identity-aware service boundaries, provider-specific backoff and UI readiness state; verify real authenticated project resolution and all pages, restart/cancel/isolation/last-good failure behavior and native rendering. Automatic CurseForge tracking remains OPEN until that evidence exists. No alternate proxy, copied site credentials or anti-bot bypass is used.

## Performance and verification boundary

No renderer or binary download is needed for this metadata contract. A bounded free-speed pass normalized version ordering for fingerprints to avoid spurious updates while retaining original order in metadata. No measured speedup is claimed. Credential-free startup has no new network operation. Fixture tests cover authentication absence, endpoint binding, labels, pagination, limits, cancellation and pauses; they do not demonstrate live provider access. Existing Windows extension-preview root cause remains separately unresolved.
