# Cross-browser sync: additive planner checkpoint

## Accepted product scope

The requested end state is one clear Sync action across every selected browser,
including Noxviola, not one-way import. Reference browsers are Opera GX, Chrome,
Firefox and Edge. Select the exact profiles and authority (for example Opera GX)
up front. Unique non-authority bookmarks belong in a temporary organizing area.
Cookies, login sessions and passwords are distinct requested categories, not
interchangeable names for bookmarks. Excellent site sign-in/OAuth compatibility
is also required; neither one browser sign-in nor a Sync button grants an API
authorization to other applications.

## Implemented here, not yet a working sync UI

`browser/bookmark-sync-plan.cjs` accepts complete explicit browser/profile
snapshots and produces per-participant additive operations, including operations
for the authority and Noxviola. There is no disk discovery, write adapter,
transport, background synchronization, OAuth implementation or runtime UI.
This is an isolated integration component for the existing PR #5 services, not
a second browser architecture. It does not modify `BookmarkService`.

- Exact URL equality deduplicates newly proposed additions; query strings,
  fragments, escapes and trailing slashes are not stripped.
- Authority metadata wins selection of a proposed addition. Remaining sources
  are processed deterministically, and all duplicate provenance is retained.
- Existing bookmarks, duplicate entries and local edits are never deleted or
  overwritten. Metadata disagreements are visible conflicts. Source deletions
  are not propagated. Renames and moves are not synchronized yet.
- Missing authority links are proposed under `Authority bookmarks`, preserving
  their folder-name path. Unique other links go under `Temporary organize`.
  This does **not** yet preserve empty folders, same-named folder identity,
  separators, all metadata or exact cross-browser tree topology. Adapters must
  retain those records before full sync can be accepted.
- Each target is bound to its revision. Preview verification recomputes the
  complete plan and rejects changed inputs or modified operations. This is not
  an authorization token or an atomic write lock; adapters still need an actual
  write-time revision check and per-target recovery journal.
- Non-HTTP(S), userinfo-bearing and obvious authentication/signed URLs stay untouched and have explicit
  quarantine receipts. No hidden dropping/truncation. This component must not
  log actual URLs or paths: bookmarks can themselves contain private data or
  tokens, even without URL userinfo.
- Cookie/login/password categories fail closed. No secret value is accepted
  as a separate supported data category. No credentials or session tokens have
  been read, copied, stored or synchronized by this work.

## Integration contract and remaining work

Use the existing identity-owned `BookmarkService` and supported browser bookmark
APIs, not raw writes into live browser databases. A companion integration needs
explicit installation and native/extension permission approval. No companion is
installed by this checkpoint. Snapshot participant identifiers must be bound to
authenticated actual browser profiles, not caller-supplied names alone.

The UI must display source/target profiles, category support and conflict policy
before its single labeled Sync action. That click can approve the displayed
scope. It cannot silently enlarge it, suppress OS/browser permission prompts,
grant access to unrelated profiles or override site authentication security.
No cookie scope should be enabled by default just because bookmarks were enabled.

Before actual writing: preserve a recoverable local backup, validate snapshot
revisions at write time, reserve stable destination IDs, implement a resumable
per-target operation journal, and read back every write. On partial failure show
which targets changed and retain retry state. Never report global success when
one participant is absent or offline. Destination folder identity must be stored
explicitly; do not find a staging folder by its display name alone.

Full acceptance requires actual Opera GX, Chrome, Firefox, Edge and Noxviola
profile tests, repeat/restart, simultaneous local edits, incomplete reads,
permission revocation, cancel/partial apply, nested and empty folders,
non-HTTP(S) records and separate containers. Fixture participant labels below
are not evidence of tested browser implementations.

## Sign-in and shared database boundaries

Modding-Knowledge is the shared public provider/database-contract home, not a
credential or browsing-history database. Reuse provider capability metadata,
supported authentication methods and non-secret schema there; keep user grants,
tokens, browser profiles and account details in private identity-scoped storage.
Inspect Modhunter's existing provider/authentication work before adding a second
implementation. This checkpoint has not audited that implementation and makes
no claim that a shared authentication service already exists.

Site OAuth needs provider-specific redirect handling, state/PKCE, cancellation,
token lifecycle and secure storage acceptance. A site session is not an app API
grant. Some providers require an external browser; do not hide provider refusal
or weaken restrictions to claim all-site support. Credential integration should
reuse established password-manager/OS stores, not plaintext exports. Cookie
transfer must preserve domain/path/security/expiry/store/partition semantics and
cannot establish that a session will remain valid on the destination.

## Primary-source review, 2026-11-16

- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks): supported bookmark tree operations require bookmark permission; protected roots have restrictions. Native adapter reuse is preferable to rewriting profile files.
- [Chrome cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies): cookies require host permission and cookie permission, and partition keys matter. This is not a universal account-transfer API.
- [Firefox cookies API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies): separate store/container and partition behavior must be reconciled, not collapsed.
- [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity): OAuth token flows have explicit scopes and interactive authorization; ordinary website sessions do not substitute.
- [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252): native-app OAuth uses an external user-agent and PKCE; this does not imply every website accepts an embedded browser.

These are API feasibility sources, not installed-version or cross-browser
compatibility measurements. No third-party source implementation was copied.

## Verification

A reviewer caught possible authentication URLs being proposed for transfer; a new regression quarantines obvious reset/token/signed-query and token-fragment URLs without echoing values. This conservative detector cannot identify every secret-bearing link. A real transfer adapter still requires scoped user authorization and must never assume a URL is non-sensitive merely because this check passes.

Late-joining profiles can currently receive nested `Authority bookmarks/Temporary organize` paths after previous imports. Persistent source folder/provenance metadata is not implemented; this known limitation blocks production tree synchronization.

Node 24.22.1: `node --test tests/bookmark-sync-plan.test.cjs` passed 16/16,
zero skips/failures. Source syntax passed. Includes five synthetic participants,
10,000 authority links, exact duplicate handling, repeated complete sync plans,
stale/modified previews, malformed/incomplete inputs and refusal of secret
categories. Existing full-suite/native tests were not run in this sparse
workspace. No comparative speed or whole-browser acceptance claim.

Reviewed against PR #5 head `c8b8b0264beff4d62eb6c110a3605ca05197fa6c`.
The active PR's main/renderer/native extension repair is deliberately untouched.
All G001–G012 remain open. The complete all-browser synchronization goal is
unresolved-active, not completed by this planner.

## Resource and private-data boundary

The **entire plan** is private and must remain unlogged. IDs, participant labels,
paths, titles, conflicts and opaque URL values can contain private data or secrets;
the obvious-link quarantine is not a general safe serializer or public redactor.
Only synthetic test results may be published.

The planner refuses the whole input above 32 participants/snapshots, 100,000 total
bookmark rows, 32,768 characters per accepted string, 32 MiB aggregate UTF-8 field
bytes or 256 folder path segments. It never truncates records. An adapter must
also bound incoming serialized bytes before parsing and limit unknown fields;
these checks only bound the accepted structured fields, not upstream parsing.
Larger legitimate datasets remain unresolved and require a measured streaming
adapter rather than hidden truncation or claiming complete synchronization.

### Output fanout budget

Independent review identified multiplicative output amplification despite the
input field-byte cap. Before allocating normalized snapshots or output, the
planner now conservatively budgets row count × selected targets (maximum
250,000 operations), folder-path slots × targets × two metadata copies (maximum
2,000,000 slots), and worst-case JSON field escaping plus object/path overhead and repeated escaped participant labels
(maximum 64 MiB projected serialized output). Oversize plans are refused whole.
This can conservatively refuse duplicate-heavy inputs that would yield a smaller
actual plan; no hidden truncation or partial success is substituted.

The 32 MiB input cap measures supported field contents, **not JavaScript heap**.
The output budget is also an estimate, not an exact process memory guarantee.
An adapter still needs bounded wire parsing and runtime resource tests. The
regression uses only 1,000-row examples to exercise amplification refusal; the
reviewer's potentially multi-gigabyte maximal input was never executed.
