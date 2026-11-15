# History, bookmark trees and workspace definitions

These are independent production services over the existing `browser/storage.cjs` checkpoint implementation. They do not change the session or media-reference vault formats, create another browser identity, select an Electron Session, or transmit data. The browser UI and extension adapter share these services.

This document describes the service contracts. Portable tests do not establish native UI, packaged-executable or complete WebExtension compatibility acceptance. The master gates remain open.

## Storage and lifecycle

| Module | Export | Version 1 document |
| --- | --- | --- |
| `browser/history.cjs` | `HistoryService` | `{version:1, items:[], preferences:[]}` |
| `browser/bookmarks.cjs` | `BookmarkService`, `rootIds(identity)` | `{version:1, nodes:[]}` |
| `browser/workspaces.cjs` | `WorkspaceService`, `DEFAULT_WORKSPACE`, `COLORS` | `{version:1, workspaces:[], groups:[]}`; the default workspace is required |
| `browser/service-store.cjs` | Shared lifecycle and field validation | Uses `storage.inspect`, `storage.write` and `storage.recover`; it defines no second persistence format or replacement algorithm |

History and bookmarks accept `{file, getIdentities, onChange?, now?}`. Supply `getIdentities: () => profiles.map(profile => profile.id)` from the canonical session. Every content operation takes an explicit identity first and checks exact membership. Case aliases are rejected without rewriting IDs. Workspace definitions organize tabs across identities; they do not contain browsing data or alter cookie isolation.

All three services expose:

- `open()` returning the storage layer's `new`, `ready` or `recovery` inspection. Unsupported versions/data throw without fallback to an older schema. Content operations are blocked until the service is ready.
- `status`, `error` and `inspection` for the UI. A recovery inspection contains the original bytes needed for an explicit restore; keep it in the main process.
- `recover(preview = inspection.preview)` after an inspected recovery and user confirmation. It preserves a damaged primary separately, checks that primary/previous bytes have not changed, restores the valid previous bytes, and reopens the service.
- `subscribe(listener)` returning an unsubscribe function. `onChange` and subscribers receive the same detached event snapshots. Listener exceptions cannot undo a durable mutation.
- `dispose()` to refuse subsequent work and release listeners. These services have no timers, polling, pending workers or shutdown writes.

Mutations are synchronous and return only after the existing atomic checkpoint write succeeds. Each mutation first checks the currently saved document against the service's opened state. An intervening writer causes `STALE_PREVIEW`; it is never silently overwritten. A failed write reports an error and requires explicit reopen/recovery before further edits. The UI must not present a successful edit before the method returns. Reopen is also the reconciliation route after an I/O error whose timing leaves commit completion uncertain.

Existing unknown document and record metadata is preserved through supported edits. Public history/bookmark/workspace results expose their defined fields rather than forwarding arbitrary future metadata. Missing/duplicate IDs, malformed trees, invalid timestamps, cross-identity references and credential-bearing URLs fail visibly. HTTP(S) addresses are supported; bookmarklets, file URLs and browser-internal addresses are not yet accepted by these stores.

The checkpoint layer retains `.previous` and explicit recovery copies. History deletion, bookmark removal and definition removal affect the live collection. They are **not forensic erasure**, and a recovery copy can contain previously removed records. The UI must disclose recovery-copy retention instead of claiming that all browsing data was erased. No backup purge, site-data clearing or filesystem wiping is performed here.

## Persistent history

Each page has a stable ID scoped to one exact identity/URL pair. Repeated committed navigations append distinct visits with stable visit IDs, timestamps, transition types and same-identity referrer IDs. History is separate from Chromium's per-tab Back/Forward stack. It records no subframe, speculative or failed navigation by itself; the main process must call it only for an accepted committed navigation.

| Method | Behavior/result |
| --- | --- |
| `record(identity, {url,title?,visitTime?,transition?,referringVisitId?})` | Adds a visit. Defaults to the current time, `link` and unknown referrer `"0"`. Returns `{recorded:true,item,visit}` after persistence; returns `{recorded:false,reason}` when explicit recording/retention policy excludes it. |
| `updateTitle(identity,url,title)` | Updates an existing page without adding a visit. No write for a missing page, unchanged title or paused recording. Bind late title events to the tab's currently committed URL. |
| `query(identity,{text?,startTime?,endTime?,offset?,limit?,maxResults?})` | Returns `{items,total,offset,hasMore}`. Results sort by newest `lastVisitTime`, then stable ID. A caller can page through every result. |
| `search(identity,query)` | Returns the query's `items` array. Defaults are all time and all results; ecosystem defaults belong in the adapter. |
| `getVisits(identity,url)` | Returns newest-first visits for this identity/URL. Also accepts `{url}`. Unknown URLs return an empty array. |
| `deleteUrl(identity,url)` | Removes every visit to that identity/URL. Also accepts `{url}`. |
| `deleteRange(identity,{startTime,endTime})` | Removes individual visits in the half-open range `[startTime,endTime)`. A page survives while it has any remaining visit. Counts and referrer links are recomputed. |
| `clear(identity)` / `deleteAll(identity)` | Removes live history for only the supplied identity; does not touch other identities, bookmarks, cookies or downloads. |
| `settings(identity)` | Returns the identity's recording and retention settings. Defaults: `recording:true`, `retentionDays:null`. |
| `configure(identity,{recording?,retentionDays?})` | Persists policy. `null` means no automatic age expiration; otherwise use positive integer days. A requested retention policy prunes older visits in the same commit. |
| `prune(identity)` | Explicitly applies that identity's saved retention policy. Recording also applies retention before appending a new visit. No background expiration timer exists; callers can invoke this on startup/maintenance when configured. |

Query text uses case-insensitive AND matching of whitespace-separated terms against URL and title. Query ranges filter each page's latest visit; deletion ranges operate on individual visits. A historical visit supplied with an older timestamp does not replace a newer page title. `updateTitle` records the latest observed committed-page title; it is not a per-visit title archive.

History mutation events are:

- `visited`: `{type,identity,item,visit}` after a recorded visit.
- `title`: `{type,identity,item}` after an existing title changes.
- `removed`: `{type,identity,allHistory,urls,visitIds}`. `urls` includes pages that lost their final visit; partial visit removal can have an empty URL list. An identity-wide clear uses `allHistory:true` and an empty URL list.
- `settings`: `{type,identity,settings}` after policy changes.

The supplied transitions cover the documented Chrome transition vocabulary. The main process must label a transition only when it knows the cause; the service does not infer a typed navigation from its URL. Firefox-specific dates/transitions and download-history behavior require their own deliberate adapter semantics.

## Hierarchical bookmarks

Each identity has stable protected root, bookmarks-bar and other-bookmarks folders. `rootIds(identity)` returns their IDs. Merely reading a new tree does not create a file. The protected folders are persisted with the first actual mutation. Ordinary folders/bookmarks/separators have UUID IDs that survive restart. Duplicate bookmark URLs are allowed.

| Method | Behavior/result |
| --- | --- |
| `get(identity,idOrIds)` | Returns an array of requested nodes; missing/cross-identity IDs throw. |
| `getTree(identity)` / `getSubTree(identity,id)` | Returns an array containing the complete requested tree, including ordered `children` for folders. |
| `getChildren(identity,parentId)` | Returns immediate children in contiguous index order. |
| `getRecent(identity,count)` | Returns recent URL bookmarks, excluding folders/separators. |
| `search(identity,stringOrObject)` | String words/quoted phrases match URL/title. `{query,title,url,tags,type}` combines all supplied criteria. Exact title/URL/tag constraints are literal. Protected roots are omitted. |
| `create(identity,{parentId?,index?,title?,url?,type?,tags?})` | Creates a bookmark, folder or separator. Defaults to the other-bookmarks folder and insertion at the end. A missing `type` becomes `bookmark` when a URL is supplied, otherwise `folder`. |
| `update(identity,id,{title?,url?,tags?})` | Edits defined properties while preserving other stored metadata. It cannot change a folder/separator into a URL bookmark. |
| `move(identity,id,{parentId?,index?})` | Moves without changing ID or identity. The index is the final position **after removing the source**. Missing index means the destination end. Self/descendant moves and cross-identity moves fail. |
| `reorder(identity,parentId,childIds)` | Requires every immediate child ID exactly once. Emits reorder, rather than false move events. |
| `remove(identity,id)` | Removes a bookmark, separator or empty ordinary folder. A nonempty folder is rejected. |
| `removeTree(identity,id)` | Explicitly removes an ordinary node and all descendants in one durable write; returns `{removed:count}`. |
| `markUsed(identity,id)` | Updates a URL bookmark's `dateLastUsed`; does not add browsing history or open a tab. |

Protected folders cannot be renamed, moved or deleted, and the tree root cannot accept user-created children. API indexes outside the destination are rejected rather than silently clamped. Stored sibling indexes must be unique and contiguous. Tree validation and construction use iterative traversal, with no arbitrary folder-depth or result cap.

Events have a common `identity` and one of these payloads:

- `created`: `{type,identity,id,node}`.
- `changed`: `{type,identity,id,changes,node}`.
- `moved`: `{type,identity,id,parentId,index,oldParentId,oldIndex,node}`.
- `removed`: `{type,identity,id,parentId,index,node}`; `node` is the removed subtree.
- `reordered`: `{type,identity,id,childIds}`.
- `used`: `{type,identity,id,node}`.

Extension adapters must translate these canonical events, enforce the accepted `bookmarks`/`history` permission and filter the exact identity. For example, tags-only changes are not a Chrome title/URL `onChanged`, and partial history visit removal is not a Firefox final-page-removal event. The service itself does not grant extension permissions or install a renderer bridge.

## Workspaces and tab groups

`WorkspaceService` accepts the common lifecycle callbacks plus synchronous `isWorkspaceInUse(id)` and `isGroupInUse(id)` callbacks. Main-process integration supplies these from the live canonical tabs. They must return booleans; unavailable/ambiguous usage fails closed.

| Method | Behavior/result |
| --- | --- |
| `list()` / `get(id)` | Reads named workspace definitions. `default` always exists. |
| `create({name,color?})` / `update(id,{name?,color?})` | Persists stable ID, name, color and creation/modification dates. |
| `remove(id)` | Rejects the default, a workspace with assigned tabs, or one that still contains group definitions. |
| `listGroups(workspaceId?)` / `getGroup(id)` | Reads definitions, optionally restricted to a workspace. |
| `createGroup({workspaceId?,name,color?,collapsed?})` | Creates a group in the supplied workspace, defaulting to `default`. |
| `updateGroup(id,{name?,color?,collapsed?})` | Edits group presentation; it does not move or discard member tabs. |
| `removeGroup(id)` | Rejects a group that still has assigned tabs. |

Colors are exported in `COLORS`. Workspace events are `workspace-created`, `workspace-changed`, `workspace-removed`; group events are `group-created`, `group-changed`, `group-removed`. Created/changed events include the resulting `workspace` or `group`; removed events include `id`.

Live `tab.workspaceId`, group membership and active workspace remain session-owned. Switching workspace must preserve background tabs and each tab's identity. An integration must move/reassign tabs before removing an in-use definition. This file is not a transaction across session and definition checkpoints and does not claim shared/remote workspace collaboration.

## Verification and performance boundaries

The focused portable service tests cover actual filesystem persistence/restart, stable IDs, independent identities, range deletion, paused recording/title privacy, retention, tree edit/move/reorder/remove, a 513-level hierarchy, 1,250 uncapped history results, detached result snapshots, failed writes without success events, stale writers, future schemas, unknown metadata, explicit recovery and in-use group/workspace refusal. All fixtures are disposable generated data.

Queries use opened in-memory indexes and perform no filesystem or network operations. Unchanged title/order/definition edits avoid work; no polling or background worker is introduced. Sibling reorder validation uses set membership, and traversal does not use a recursive call stack. Writes still validate and serialize a complete JSON checkpoint through the existing storage layer, so cost grows with saved data. Large-library navigation latency, end-to-end resource use, native rendering and long-session scaling require measurement; no performance superiority claim follows from these structural improvements. A future indexed/async storage change must preserve every record and the recovery guarantees and demonstrate an equivalent-work benefit.

## Primary references checked for adapter design

- [Chrome history API](https://developer.chrome.com/docs/extensions/reference/api/history): page/visit distinction, transition fields, query defaults and mutation events.
- [Mozilla history.search](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/history/search) and [history.deleteRange](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/history/deleteRange): term matching, latest-visit filtering and individual-visit removal. Firefox's accepted date representations and minimum result-count rule belong in its adapter, not a hidden canonical-store limit.
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks): stable ordered tree IDs, protected roots, query criteria and event meanings.
- [Mozilla bookmarks](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks) and [bookmarks.move](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks/move): folder/separator model and movement destinations.

These references inform the explicit service contracts; they do not certify full Chrome/Firefox API compatibility. The compatibility adapter still needs actual extension/runtime tests for its parameter conversion, default values, callback/Promise behavior, event timing, unsupported schemes and ecosystem differences.
