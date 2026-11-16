# Downloads and durable transfer history

`browser/downloads.cjs` owns both the live Electron download lifecycle and its local history. A saved record is metadata, not a native `DownloadItem`. Restart never recreates an item, resumes a transfer, requests its source URL or removes a downloaded file automatically.

The production application stores the versioned document in `browser-downloads.json` under its application-data directory. It uses the existing `service-store.cjs` lifecycle and `storage.cjs` private atomic checkpoints, verified previous copy and explicit recovery. There is no second persistence implementation or arbitrary record-count/age limit.

## Native lifecycle and restart behavior

The destination chooser is configured synchronously inside the Session's `will-download` callback. Electron then obtains the actual destination through its normal save dialog. The manager reads native state and bytes from the actual item; it does not fabricate progress or a successful destination.

| Observed state | Live behavior | After a fresh manager opens history |
| --- | --- | --- |
| Choosing a destination | Active item; cancellation is available. | Interrupted history, with `savedState: "choosing-location"`; no native item or resume. |
| Progressing or paused | Actual pause/resume/cancel controls; still active. | Interrupted history with the original saved state and byte checkpoint. |
| `updated` reports interrupted | Still a live item; resume is offered only when the native item reports it available. | Interrupted history; no native resume is inferred. |
| `done` reports completed | Terminal, with finish time and final observed bytes/path. | Completed history; Show in folder can reveal the recorded path. |
| `done` reports cancelled | Terminal cancelled record. | Cancelled history, without retry/resume. |
| `done` reports interrupted | Terminal interruption; no live item remains. | Terminal interrupted history, distinguished from an unfinished previous process. |

An unfinished saved record is presented with `interruptedByRestart: true`, `terminal: true`, `hasNativeItem: false` and `canResume: false`. Its raw last-known state stays in the checkpoint and is exposed as `savedState`; the manager does not invent a finish time or claim that native cancellation completed. Opening history is read-only.

The distinction follows the pinned Electron 44.11.3 [`updated` and `done` contracts](https://github.com/electron/electron/blob/v44.11.3/docs/api/download-item.md). `done` is the terminal boundary. A getter can briefly report cancellation/completion before that event; the manager keeps the history nonterminal until the actual event arrives. Electron's documented live `resume()` behavior can restart from the beginning if the server does not provide the required range/validator support. No cross-process retry contract is claimed.

## Integration API

```js
const downloads = new DownloadManager({
  directory: app.getPath('downloads'),
  file: path.join(dataDirectory, 'browser-downloads.json'),
  getIdentities: () => profiles.map(profile => profile.id),
  reveal: file => shell.showItemInFolder(file)
});

downloads.on('change', () => {
  if (panel === 'downloads') send('downloads', downloads.list());
});
downloads.on('status', status => publishDownloadStatus(status));

// Startup can report an unavailable history while ordinary transfers remain usable.
try { downloads.open(); } catch (error) { reportHistoryError(error); }
downloads.attach(actualIdentitySession, exactIdentityId);
```

`change` is an invalidation event without a payload. The caller requests `.list()` only when needed, so native byte-progress events do not clone an unlimited hidden history. Both change/status publication and native events are event-driven; no sampling or persistence timer is installed.

| Method | Contract |
| --- | --- |
| `open()` | Inspect the primary/previous checkpoint. Return `new`, `ready` or `recovery`, or throw for an unsupported/unreadable document. An inspected previous copy is not automatically restored. Preserve this process's active and unsaved native records. |
| `getStatus()` | Return `{status, error, pendingCount, recoveryAvailable, persistent}`. The same small object is emitted on `status` changes. |
| `attach(session, identity)` | Bind one actual Session to one exact configured identity. Repeated identical attachment is harmless; conflicting identity attachment and case aliases are rejected. |
| `list({identity} = {})` | Return independent copies of complete records, optionally filtered by exact identity. Default history is app-wide and identity-tagged, matching the existing Downloads panel; it is not a confidential per-profile store. |
| `action(id, action)` | Apply `pause`, `resume` or `cancel` only to the actual live item. `reveal` is available only for a completed record with a path. Saved history has no live controls. `retry` explicitly rejects as unsupported. |
| `remove(id)` | Durably remove one non-live history record, returning `{removed: 1, persisted: true}`. Reject a targeted active item before any write. Never touch the downloaded file. |
| `clear({identity} = {})` | Durably remove all matching metadata, or all history if no identity is supplied. Reject the complete operation if any targeted live item remains. Return `{removed, persisted}`; do not silently skip active records. |
| `recover()` | Restore the exact inspected previous checkpoint through canonical recovery and return its `preserved` primary-copy path. Preserve current live callbacks and pending records. A subsequent `flush()` commits those pending snapshots. |
| `flush()` | Synchronously capture current native metadata and commit it. Throw if history is blocked, externally changed or cannot be written. It does not silently acknowledge a durable close checkpoint. |
| `cancelActive()` | Return a Promise that resolves to `{settled}` only after every targeted live item emits its actual terminal `done` event. Reject native cancellation errors; remove settlement observers on success or failure. No polling, delay, timeout-based success or synthetic terminal event. |
| `dispose()` | Detach Session/item listeners and reject outstanding cancellation waits. It does not save, delete files, or pretend an unfinished transfer completed. |

The optional `now` callback exists for deterministic portable contracts. Omitting `file` retains an explicit memory-only compatibility mode with `persistent: false` and `status: "memory"`; that mode does not claim saved history. Production supplies the file path.

### Rows and status

Persisted fields are `id`, `identity`, `filename`, `url`, `startedAt`, `received`, `total`, `state`, `terminal`, `paused`, `canResume`, `path`, `error` and optional `finishedAt`. IDs are stable strings, timestamps are exact ISO dates and byte counters are nonnegative safe integers. Zero total bytes can mean the native total is unavailable; it is not a completion result. Native item objects, callbacks, promises and Session objects never enter the checkpoint.

Returned rows additionally contain:

- `hasNativeItem`, `restored`, `interruptedByRestart` and `savedState`, distinguishing an actual active item from history.
- `cancelPending`, which keeps controls visibly waiting while a requested cancellation has not produced `done`. Repeated Cancel does not resend the native request; pause/resume reject during this interval.
- `historySaved` and `historyPending`, describing the most recent meaningful lifecycle checkpoint. Ordinary byte progress can be newer than that checkpoint without being a save failure.

`pendingCount` counts lifecycle snapshots that have not been durably saved. A failed explicit close `flush()` also marks changed progress snapshots pending. Global `status/error` must be shown with row state: a last successful checkpoint does not guarantee that an externally modified file remains usable. `recoveryAvailable` means a previous checkpoint has been inspected; exact bytes are checked again at recovery, and a stale preview still rejects.

## Persistence boundaries and failures

The manager checkpoints a new transfer, a chosen destination, native state/pause/resume changes, capture errors, terminal `done`, explicit history edits and close `flush()`. Continuous received-byte updates change the live view without writing the complete history on every event. A checkpoint includes the latest observed bytes for all rows. Large-history write/search cost still requires measured native evaluation; no efficiency advantage is inferred from the lack of a write timer.

Downloads remain honestly visible and controllable when history cannot be opened or saved. Persistence failure neither cancels the transfer nor replaces old bytes with an empty document. The affected row stays pending, and the status exposes the error. A failed Remove/Clear leaves the row visible and throws instead of presenting success. Explicit Retry in the integration calls `open()` then `flush()`; it re-inspects storage before committing pending native metadata.

Unknown document and record metadata survives successful edits. Duplicate IDs, contradictory terminal fields and invalid byte/time values are rejected. Unsupported versions/states and ambiguous identity aliases preserve the original file and do not fall back to an older schema. Canonical storage also rejects duplicate JSON keys and numbers that cannot round-trip exactly.

Reopening a valid file preserves the exact live row/data objects referenced by native listener closures. A conflicting external record with the same ID blocks saving rather than silently overwriting the other writer. Explicit recovery may merge the recovered metadata for the same immutable transfer identity with current native state; it preserves unknown keys as data without invoking prototype setters. The corrupt primary is retained separately before restoration. These mechanisms preserve evidence; they are not automatic conflict resolution or forensic erasure.

### Close integration

After the user chooses to cancel active transfers and close:

```js
await downloads.cancelActive(); // Actual native done events, including asynchronous ones.
downloads.flush();             // Throws on history failure.
// Only after all other application save/close gates succeed:
downloads.dispose();
```

A cancellation exception must cancel the close attempt and remain visible. A flush error must enter the application's existing save-failure handling: keep the browser open for explicit retry/recovery, or ask for an explicit exit without saving recent transfer metadata. Merely detaching listeners, observing a cancelled getter state or successfully sending a cancel request cannot qualify the final save.

## Privacy and unsupported operations

History contains plaintext source URLs, filenames, destinations, identities and times. URLs can include sensitive query parameters; local paths reveal user directory information. Treat the file, its previous checkpoint and preserved recovery files as private. Test fixtures use generated data only.

Remove/Clear changes the active metadata list; a prior checkpoint or recovery copy can retain earlier records. No downloaded file is deleted, opened/executed or overwritten by those history operations. Show in folder delegates to the OS; it does not certify that the recorded file still exists or has its original bytes.

Cross-process resume and retry are unsupported. A URL alone cannot reproduce request methods, headers, authentication, body semantics, redirect validators or an approved destination safely. The manager does not call `downloadURL` or `createInterruptedDownload` from stored history and does not turn history restoration into a network request. Any later retry/resume implementation needs a separate explicit contract and native proof.

## Verification status

The original four lifecycle contracts plus sixteen focused durable-history contracts pass in Node. They exercise restart with all terminal/incomplete states, progress without repeated writes, disk failure, exact-byte explicit recovery, external modifications, future-schema and identity-alias preservation, unknown metadata, complete 1,250-record history, metadata-only removal, native cancellation completion/error/disposal, and retained callback/prototype boundaries.

These are portable contracts with synthetic Electron items and real disposable filesystem checkpoints. They do not establish native picker, interruption, shutdown or packaged restart acceptance. Actual hosted completion/file-byte/history restart evidence belongs to a later exact source receipt; the earlier 3253 download pass predates this persistence implementation.

Primary lifecycle reference: [Electron 44.11.3 DownloadItem documentation](https://github.com/electron/electron/blob/v44.11.3/docs/api/download-item.md), Git blob `0c18c99ad7b664f36fb3dec3635a1f210057d540`. Storage guarantees remain owned by [storage.cjs](../../browser/storage.cjs); the concrete contracts are [downloads.test.cjs](../../tests/downloads.test.cjs) and [download-history.test.cjs](../../tests/download-history.test.cjs).
