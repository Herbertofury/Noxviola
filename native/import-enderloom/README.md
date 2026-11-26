# Enderloom JSON reader

This standalone Rust library reads an **explicitly selected** Enderloom JSON
file or a named file in a selected export directory. It does not discover a
profile, modify source files, or write Noxviola state. Call
`read_document(path, DocumentKind::Session)` for an explicitly selected session
or `read_from_directory(directory, kind)` for one of `Session`, `Library`, and
`Downloads`. Handle each error visibly; a missing or malformed file is not an
empty profile. Callers decide when and how to import the returned data.

`Document.value` retains the complete parsed JSON tree, including unrecognized
fields. `Document::tabs()` exposes the original tab array without deduplicating
or reordering; the session's `tabSequence`, IDs, active tab, split metadata and
closed tabs remain in the tree for the application to interpret. Number values
retain arbitrary precision. The original file stays untouched; JSON formatting
and duplicate object keys are not retained in the parsed tree. The exact source
bytes are available as `Document.original_bytes` for lossless archival.

This does **not** import or interpret Chromium cookies, logins, storage,
partitions, or the encrypted `browser-downloads.json.requests` file. It does not
assert that authentication or downloads can be resumed in another engine.
Paths, history, and URLs can contain sensitive information: do not log or upload
the returned tree by default.

Run synthetic tests with `cargo test --manifest-path native/import-enderloom/Cargo.toml`.
