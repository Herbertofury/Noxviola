# Windows packaged preview — 27272b1

On 2026-11-15 (Mountain time), a clean detached checkout of commit `27272b1d96f4c5323ef4597fd474efdebaa4e250` was built locally for Windows x64 with Electron 45.3.2. `npm test` passed 342 tests and `npm run check` passed. This is an experimental preview, not a signed or fully qualified release.

The package builder verified 48 application and dependency files and 73 package files. The separate native packaged gate launched the exact package twice under a generated synthetic profile. It passed real HTTPS browsing (the two public documents named by the harness), navigation and history, more than twelve live tabs, identity web-store isolation, a normal OS close, and a restart with the saved tabs, identities, preferences and generated Library data. The result does not qualify all websites, extensions, owner profiles, privacy claims, or browser performance at scale.

The unchanged portable ZIP was independently verified against its manifest. Its SHA-256 is `80c3df897b77afddbdbc6ae841d706875a438901931d5aabe5613e8d33fcdd00`. The [packaged acceptance receipt](https://drive.google.com/file/d/1kpxLmpxt7duHoHt4IuUqjgI094u7OVqk/view), [package receipt](https://drive.google.com/file/d/1LqyWXY6zCu1FPZ3fbuC_EyAKIhC5lWJk/view), and [checkpoint folder](https://drive.google.com/drive/folders/1z32A6Kl8C1rSz8PYMqmFMMNe7h1gS672) were uploaded to Drive. Due to the connector's 100 MiB upload limit, the archived ZIP is stored there in two bytewise parts with a hash manifest; concatenate part 1 then part 2 and verify the full SHA-256 to reconstruct it.

Hosted native and contracts jobs at this exact commit passed on Windows and Linux. The separate real Dark Reader jobs failed on both platforms; the extension options-page defect remains open. Extension history traversal has portable contract coverage, but it has not yet been established through a real extension runtime. This preview predates the in-progress hover-preview and extension-page work.

