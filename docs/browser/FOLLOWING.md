# Following: one browser, an informed user

Requested 2026-11-16. Flagship/premium-quality capability, not a new paid entitlement or billing flow. Noxviola must follow creators and projects independently of Athena; shared research, connector contracts and proven techniques must not introduce an Athena runtime requirement.

## Implemented checkpoint

Open **Tools → Following**, or the native browser menu. Add a named creator/project with an HTTPS source. The watchlist is scoped to the browser identity and saved locally using the browser's existing atomic checkpoint and explicit recovery service.

- GitHub repository URL: published release metadata, including prereleases returned by the public API.
- GitHub owner URL: public repository discovery and latest repository activity metadata. This is not a commit-by-commit event stream or a claim to discover every associated social account.
- Other HTTPS URLs: manual follow references, preserving query and fragment identity. They are explicitly labeled as manual, with no fake refresh or automatic tracking control.
- Native card library with search, creator/project/unread/paused filters, unread state, source and update opening, source freshness/error indicators, pause/resume and mark-read. Untrusted text is rendered as text, never HTML.
- Optional hourly checks while the browser is open; disabled by default. The scheduler wakes once per minute, prevents overlapping rounds and coalesces duplicate checks. Browser close cancels work. No server, background daemon, external notification enrollment or login is required.
- Every exposed pagination page is collected before a successful commit. Per-page ETags preserve complete cached page metadata on HTTP 304. A malformed/blocked/timed-out page keeps last-good results rather than reporting a partial success. Removed upstream entries remain saved; changed metadata for a stable item resets unread state.
- Pausing or changing controls cancels outstanding work and rejects its late result. Different browser identities cannot mutate one another's follows through service commands. Draft form ownership is retained across identity changes.

No website cookies, private account credentials, vault content or browsing history are sent. Requests go only to generated public GitHub API paths. Redirects are rejected; pagination is restricted to the same API origin and path. Opening a saved source/update uses ordinary browser navigation in its recorded identity. Files/assets are not downloaded or executed. Missing adapters remain visible and open work, not silent fallback to permissive arbitrary scraping.

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
