# Noxviola session core

Rust session model based on the version-1 `browser-session.json` format from
[draft PR #5](https://github.com/Herbertofury/Noxviola/pull/5). The prior
browser is GPL-3.0-only and documents its Enderloom provenance. This crate
is also GPL-3.0-only. No private data is included.

`load` returns either a new session, a valid primary session, or a valid
previous checkpoint accompanied by an explanation. An unreadable primary or
checkpoint is never silently replaced. A recovery interface is still needed;
the application must show the recovery state and must not save over it. The
caller must ensure only one writer accesses a session at a time. Unknown JSON
fields are retained, but unsupported versions and invalid records are not
normalized or dropped. Tab records, including repeated URLs, remain distinct.

Profiles here are names and routing metadata only: actual cookie and storage
isolation must be implemented and tested in the rendering engine. This crate
does not import browser data, implement an engine, or provide the vault and
account stores. Do not point an experimental browser at a real profile before
its migration and recovery behavior has been reviewed and verified.

Run `cargo test --manifest-path native/core/Cargo.toml` from the repository
root. Tests operate only on generated temporary files.
