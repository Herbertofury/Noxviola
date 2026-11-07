# Active project work

Updated 2026-11-07 UTC. This is the maintained Noxviola continuation index. Project-local plans remain authoritative for implementation detail. The earlier checklist and verified checkpoints are preserved below; an old checkpoint does not close a whole project.

## Current priorities and next actions · 2026-11-07

**AoA is unfinished. Engineering Atlas is an ongoing project, not a finite task that becomes complete after one article, experiment or release.** Keep both in the working queue. Check the existing work and current owner before starting another pass, then record a concrete result or the exact remaining blocker.

### AoA: finish the arsenal and restoration

- [ ] **Correct the rejected Rune Bead Bow orientation first.** Use the inspected shooter-side references: the long straight rail extends rearward toward the shooter. Correct the stock placement while retaining the arrowless central bead rail. Inspect the actual replacement image before calling it fixed. [Current rejection and reference contract](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Rune-Bead-Bow-Proposal.md). Further large-melee publication remains held behind this correction unless the owner changes the order; preserve the five already-published maul candidates and the three later held candidates.
- [ ] **Finish Runewinder's outstanding design and implementation.** Replace the rejected reload sheet with ONE smooth transparent rotating sleeve, resolve the fictional actuation/reset presentation, and preserve bead identity, order, charge and next-shot state. Keep the sidearm, rifle conversion, Archergun base/upgrade and separate bead bow distinct. [Runewinder contract](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Runewinder-New-Weapon-Proposal.md) · [Mechanism review](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Necklace-Weapon-Mechanism-Review.md).
- [ ] **Integrate the preserved Runewinder v7 partial-recharge fix without recreating it.** Verified November 7: the preserved v7 candidate, including the consumed-slot presentation fix, compiled on Java 17 with `--release 17 -Xlint:all -Werror` and passed all 11 test mains. This qualifies the standalone Java candidate, not Minecraft/TaCZ integration or native acceptance. The rerun receipt has no public evidence link. Next compare the preserved candidate with current AoA source and complete the approved integration and native tests. Keep this item open.
- [ ] **Reconcile every weapon against the full backlog and finish complete vertical slices.** The current pinned Minecraft 1.20.1 / AoA 3.7.1 production queue records **0 of 228 ranged registrations fully accepted**. This is the first-lane queue, not full-project coverage or a percentage of the complete project. Include the broader 434-identity concept registry, historical-only weapons and other families without confusing overlapping counts. Verify native behavior, licensed assets, actual first-/third-person animation, resources, interruptions, saves, multiplayer, sound/VFX, attachments and performance. Concept coverage or offline state tests are not finished weapons. [Production queue](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/arsenal-production-queue.json) · [Weapon implementation backlog](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Weapon-Upgrade-Backlog.md).
- [ ] **Continue the all-era AoA restoration, not only weapon artwork.** Reconcile the existing playable candidate with the accepted historical/latest content union, then select the next unmet progression, compatibility, multiplayer, migration or equivalent-work performance gate. Preserve scoped playable results without calling them a complete merge. [Restoration roadmap](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Roadmap.md) · [Progress and limits](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Progress.md).

### Engineering Atlas: continuously improve a real, reusable application

- [ ] **ONGOING: research, implement, measure and maintain Atlas across its full existing inventory.** Build real usable workflows and reusable starting points for apps, mods, games, browser games and extensions. Keep source research, synthetic fixtures, real-source tests and actual app results distinct. Finish one measured implementation step, record it, then select the next useful permitted step. Do not mark this ongoing goal complete. [Research catalog](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/research-catalog.md) · [38 planned comparisons](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/research-test-queue.md) · [Roadmap](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/roadmap.md).
- [ ] **Recover the unpublished Atlas improvements and reconcile them with the current branch.** Last reported November 6: persisted/paginated recovery history and interruption checks; Modrinth/GitHub adapter validation; superseded-file-read cancellation; unsafe-image completeness reporting; and a Bluesky image-card candidate. These were local, with differing test coverage and outstanding publication or final-browser checks. Inventory exact local commits and dirty files, preserve evidence, then complete integration and full checks before publishing. Do not recreate them from scratch or turn an access denial into permission to use another route.
- [ ] **Complete the gallery/media acceptance beyond URL comparison.** [Draft PR #9](https://github.com/Herbertofury/Engineering-Atlas/pull/9) is open and unmerged at `a723e81c73f403190ef44a9f8bea26e0f564f4f1`. Its record reports a real-browser six-pair Sodium comparison, changed/unknown/error/cancellation/last-good cases and passing CI. Image decoding, full gallery content, freshness, player readiness and playback remain separate open gates. Recover the existing local preview candidate; verify actual decoded images before any success claim. The previous preview attempts failed under the app image policy and then the outbound CDN restriction. Respect those boundaries and keep independent work moving.
- [ ] **Complete browser qualification for the published Overview metrics repair.** [Draft PR #10](https://github.com/Herbertofury/Engineering-Atlas/pull/10) is open and unmerged at `a75b72424f7fd291632ec75fd3ee2859c2d02aa0`, stacked on PR #9 rather than main. The published candidate passes 321 Python and 314 JavaScript tests; [full CI run 42330828907](https://github.com/Herbertofury/Engineering-Atlas/actions/runs/42330828907) passed on that exact commit, including Linux and Windows Rust. [Retained repair evidence](https://github.com/Herbertofury/Engineering-Atlas/blob/a75b72424f7fd291632ec75fd3ee2859c2d02aa0/experiments/overview-metrics-lab/README.md) covers synthetic malformed responses through the actual render/refresh functions in a controlled DOM/fetch harness. The fresh Chromium regression attempt was blocked before page creation by process-socket denial; no native-browser pass or screenshot is claimed. Next run the failed-response/last-good/recovery flow in a permitted browser environment. No merge, deployment, performance or general provider-acceptance claim.
- [ ] **Complete browser/provider qualification for the gallery URL-type repair.** [Draft PR #11](https://github.com/Herbertofury/Engineering-Atlas/pull/11) is open and unmerged at `13af2857af303ac54398a88ba965a966331e1e26`, stacked on PR #10. It rejects malformed non-string gallery URL fields as unknown rather than allowing JavaScript coercion to produce false matches. The published candidate passes 321 Python and 320 JavaScript tests; [full CI run 42331899264](https://github.com/Herbertofury/Engineering-Atlas/actions/runs/42331899264) passed on that exact commit, including Linux and Windows Rust. [Retained regression evidence](https://github.com/Herbertofury/Engineering-Atlas/blob/13af2857af303ac54398a88ba965a966331e1e26/experiments/gallery-url-contract-lab/README.md) records five baseline false matches and five repaired unknown outcomes from synthetic altered inputs, not malformed live-provider responses. Next verify local-file comparison, exported receipt, unknown/error recovery and healthy URL normalization in a permitted browser against the actual app/server. Browser/provider tests, media decoding/playback and full-adapter acceptance remain open. No merge, deployment or performance claim.
- [ ] **Finish the Bluesky path as an actual application adapter.** Reuse the existing normalizer and saved-public-post candidate; add or verify transport, pagination, recovery, identity and final-build browser behavior. The November 6 card display and fixture passes do not prove live image decoding or complete provider coverage. [Bluesky guide](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/adapters/bluesky.md) · [Atlas app](https://github.com/Herbertofury/Engineering-Atlas/blob/main/apps/atlas-lab/README.md).
- [x] **Publish the Movez article tool inventory and bounded workflows in the main Atlas repository.** Verified November 7: [article guide](https://github.com/Herbertofury/Engineering-Atlas/blob/089b4ecfc4046fbef6eb70469185801bc3382759/docs/app-study/README.md) is present and [CI run 42310507868](https://github.com/Herbertofury/Engineering-Atlas/actions/runs/42310507868) completed successfully for `089b4ecfc4046fbef6eb70469185801bc3382759`. This completes that documentation checkpoint, not the separate wiki publication or tool execution.
- [ ] **Publish and read back the four prepared article wiki pages.** [Prepared wiki package and exact steps](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/wiki-app-study/README.md) still explicitly says not published. The last write preflight lacked usable existing wiki authentication. Reconcile against the current wiki, preserve unrelated pages/navigation, publish only through authorized access, and verify all four page bytes plus navigation before closing this item. Main-repository API access does not itself establish wiki write access.
- [ ] **Finish measurement and promotion gates.** Reconcile the newer card-visibility/retained-count candidates with actual browser evidence; close input/scroll latency, memory, complete-output, parser-tail and durable-storage gaps against representative workloads. Keep the existing 38 comparisons as plans until executed. Promote methods into another project's implementation or wiki only after a meaningful comparison with that project's current baseline.

### Other unfinished project commitments

- [ ] **Apex: retain the full delivery target and current ownership.** The [accountability record](MOST-USELESS-AI-ACCOUNTABILITY.md#apex) still requires the complete Dynamic CAS controls, hybrid/form behavior, real-game qualification and a valid matched hitch investigation. Before any continuation, inspect the latest assigned work and artifact; do not interrupt or duplicate the current owner. No final completion is asserted by this tracker refresh.
- [ ] **External CAS: preserve the surviving implementation and finish the actual user flow.** Full room/Sim/CC rendering, posing, outfit editing, save/close/reopen and the supported game round-trip remain required by the [delivery checklist](MOST-USELESS-AI-ACCOUNTABILITY.md#external-cas). Reconcile later local changes and current ownership before resuming. Historical handshakes, source packages and isolated texture tests do not close it.
- [ ] **Evaluate high-payoff CAS alternatives with evidence.** Compare the requested modern category/library UI and architectural alternatives against actual Sims constraints and measured workloads. Keep this independent of an active Apex implementation owner. Record promising findings in Atlas only with limitations and measured payoff, not a claimed universal or unmeasured speedup.

### Continuation discipline

- At the start and end of a work pass, read this queue and the relevant current project checkpoint. Keep one owner per shared code path or game session.
- Use explicit states: ongoing, open, blocked on a named step, verified checkpoint, or complete with evidence. A task can remain open while one permitted part progresses.
- When a step is blocked, try a few safe relevant recovery steps, record the exact action and outcome, and continue another already-authorized unblocked item. Preserve pauses, access denials and confirmation requirements.
- Update this list when a milestone, blocker or priority changes. Keep deliverables and detailed evidence in their own project repositories. Do not publish private saves, raw conversations, credentials or account data here.

## Preserved project checklist and checkpoints

The remainder is retained from the October 29 checklist so no open request, existing verification link or explicit hold is lost. Dated results below remain scoped historical evidence. Reconcile newer evidence before repeating work or promoting a candidate.

## Advent of Ascension

[Repository](https://github.com/Herbertofury/Advent-of-Ascension) · [Weapon concepts](https://herbertofury.github.io/Advent-of-Ascension/weapon-concepts.html) · [Wiki](https://github.com/Herbertofury/Advent-of-Ascension/wiki)

- [ ] Reconcile the complete native weapon registry with concept coverage, requested revisions and implementation gates. Do not call image coverage native gameplay completion.
- [ ] Continue outstanding weapon concepts, building on existing assets rather than duplicating completed concepts. Baron SSR's cosmetic study is published; the new owner-requested Runewinder now takes priority over the pending Golder Bomber review.
- [x] Keep Blast Cannon's new design separate from Blast Barrel. Published concept checkpoint: [f069d88](https://github.com/Herbertofury/Advent-of-Ascension/commit/f069d882223b23c0de3b689f48b1d9c0d6af1a3e).
- [x] Blast Barrel concept: one upper and two lower side-by-side barrels; earlier versions retained at the same checkpoint.
- [ ] For every AoA weapon: outstanding visual finish plus functioning, animated game internals at a strong TaCZ-pack standard. Reuse a suitable licensed similar weapon or rough mesh where advantageous, then refine rather than automatically starting from zero. Completion requires coherent internal part motion, resource/firing synchronization, interruption recovery, hand clearance and native evidence, not concept art alone.
- [ ] Prefer the highest-quality suitable base assets. Check the exact model/animation/texture license and redistribution/modification scope. If author permission is needed, ask the user with the asset, author, source link and intended reuse; keep the candidate blocked until permission is documented. Do not assume permission from a public download or contact authors without authorization.
- [ ] Finish per-weapon lore, native behavior comparison, supply path, ergonomics, animations, attachments, tracer/projectile/impact/death effects, skins, charms and QA documentation.
- [ ] Continue models and animation only within their approved scope. Preserve specifically paused native/rig tasks.
- [ ] Verify each weapon in its pinned native stack before marking runtime gates complete.
- [ ] Boom Boom main redesign remains unresolved; existing concept retained. Pig and creeper-pig accessory concepts are separate, not a replacement main weapon.
- [x] FM-9D inspiration reference added to the AoA inspiration wiki; video reference is not footage-level mechanism verification.

## Engineering Atlas

[Repository](https://github.com/Herbertofury/Engineering-Atlas) · [Evidence](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/experiment-evidence.md) · [Wiki](https://github.com/Herbertofury/Engineering-Atlas/wiki)

- [ ] Continuous bounded research and actual implementation improvements, not idle checks alone.
- [x] Finish receipt-gate repair publication verification and CI for [e9ee647](https://github.com/Herbertofury/Engineering-Atlas/commit/e9ee6473bf21b3f69c6d6726f17a0789b92a96b1).
- [ ] Expand permitted real-source adapter coverage and complete media/card tests; distinguish fixtures, public, authenticated, player-ready and actually-playing.
- [ ] Close native UI, input/scroll latency, process-memory and end-to-end measurement gaps.
- [ ] Diagnose retained parser tail regressions and evaluate representative larger inputs before promotion.
- [ ] Continue durable-write/storage and worker-count comparisons with full-data parity and bounded resources.
- [ ] Review and test candidate techniques before ranking or adoption. Keep failed evidence and last-good versions.
- [ ] Publish findings to another project's wiki/TODO only after comparison against that project's actual current implementation proves improvement without sacrificing requirements.

## Latest verified checkpoints

- Atlas receipt-gate repair: 26 exact remote blobs, 67 Python and 73 Node tests, Linux/Windows CI and Pages passed. [Wiki evidence](https://github.com/Herbertofury/Engineering-Atlas/wiki/Experiment-Evidence).
- Baron SSR cosmetic study: [561f469](https://github.com/Herbertofury/Advent-of-Ascension/commit/561f4699841c41accce53f1db5ad9215eeac847f), three finishes and three detached charm designs. Wiki saved; Pages deployment passed and served catalogue matched exactly. The gallery’s original hero and new study link were checked. All 434 registry identities and native acceptance flags preserved.

- Complete AoA wiki task reconciliation: [740816a](https://github.com/Herbertofury/Advent-of-Ascension/commit/740816adc69e1b9719e9c2a1058f61643a59cda4), 496 pages / 1,298 source tasks. Eight maintenance tests and the local drift check passed; remote checklist CI passed. Source checkmarks are not native completion.

## Completion standard

Every active item should have a concrete next step, evidence link and honest status. Reconcile this index with project-local work before starting, avoid overlapping active passes, and update it when verified milestones or blockers change. Do not infer permission to resume paused work or modify unrelated deployments.

## Runewinder · new weapon

[Proposal](https://github.com/Herbertofury/Advent-of-Ascension/wiki/Runewinder-New-Weapon-Proposal) · [Concept presentation](https://herbertofury.github.io/Advent-of-Ascension/runewinder-concept.html)

- [x] Create standard rune-bead and purple Soulflame concept candidates with player-facing glass and flame sight; separate from the 434 released identities.
- [ ] Replace the rejected segmented-shutter reload storyboard. The confirmed cover is ONE smooth transparent sleeve rotating around the chamber like a bank pneumatic-tube carrier, not a hinged door, slats or a coiling blind. Corrected illustration remains unavailable; do not present the old sheet as current.
- [x] Create cyan cold/Soulfire variant and mixed-element necklace/optional-cosmetic sheet. Art remains unaccepted for native use.
- [x] Publish and verify the cyan variant, owner-approved functional rules and tested source packages in AoA; synchronize the complete wiki checklist. The corrected reload image is still separately open.
- [ ] Implement capacity from customizable bead count and projectile sequence from ordered bead types, including alternating ice/fire and poison/fire arrangements.
- [ ] Keep every bead on the necklace: firing darkens it, mana recharge relights it. Preserve individual charge, identity, order and next-shot index through partial reloads and saves.
- [ ] Implement one-object necklace extraction, in-hand charging and fast side reinsertion without duplication/loss; verify the smooth rotating sleeve and actual camera visibility.
- [ ] Evaluate requested Ars Nouveau, Iron's Spells/IronsArms and Botania mana adapters separately, with explicit costs, cancellation and optional-dependency tests. None is yet claimed compatible.
- [ ] Finish the authored shared rig, native motion, glass/sight fit, accessibility, networking and performance. Existing confirmed-shot sequencer is reused unchanged in a passing offline pose-target prototype; this does not complete native implementation.
- [ ] Keep dimension skins cosmetic unless a functional bead/attachment definition explicitly changes gameplay. Ask for donor permission where required.

### Runewinder implementation checkpoint

The isolated bead-state candidate passes 80,000 simulated shots with ordered elements, persistent bead identities, dark/relit charge, replay guards and immutable in-memory snapshots. It reuses the existing confirmed-shot sequencer. Mana charging is simulated only; no external mana debit, native save system, rig or compatibility acceptance is claimed. The cyan attachment sheet is corrected; the reload illustration still requires the approved smooth rotating-cover design.

### Verified continuation · 2026-10-27

- Runewinder source commit [6e3eeb4](https://github.com/Herbertofury/Advent-of-Ascension/commit/6e3eeb44e205f823de12047bf1c6aa2d084f87cd): six exact source files. Checklist commit [2423471](https://github.com/Herbertofury/Advent-of-Ascension/commit/2423471d1736a4182f05ee3a89ac30fac744c3ef): exact snapshot, living-checklist CI and Pages passed. Served HTML and both displayed images checked; the rejected reload art is absent.
- Atlas [ff4dc67](https://github.com/Herbertofury/Engineering-Atlas/commit/ff4dc67779565f43983633fd21b0e387603f5ad8): repaired provider-detail overwrite of media event identity, 16 exact remote files, 78 JavaScript / 67 Python checks locally. Linux/Windows CI and live-player regression passed; evidence commit [c42e371](https://github.com/Herbertofury/Engineering-Atlas/commit/c42e3712b3c80064135afe4213ce69a002ff6a21) also passed CI and Pages. All nine served assets matched. Actual brief Steam play/pause and failed-only preview retry were verified; 22 successes remained, one thumbnail still failed. [Wiki evidence](https://github.com/Herbertofury/Engineering-Atlas/wiki/Experiment-Evidence#media-event-identity-repair--2026-10-27). No performance or other-project promotion claim.

### Runewinder rifle conversion · requested 2026-10-27

- [x] Create and deliver standard/Soulflame rifle-conversion concept art, retained alongside the sidearm concepts in AoA.
- [ ] Implement the functional rifle-conversion attachment with upgraded gameplay stats, using the Guycot rifle as a visual reference. Preserve necklace identity, bead count/order, charge and next-shot state; no free refill on conversion. Exact upgrades require balance/native tests. [Design and artwork](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Runewinder-New-Weapon-Proposal.md#rifle-conversion-attachment--owner-direction-2026-10-27).

### Mechanism-first correction and necklace archergun · 2026-10-27

- [ ] Before generating future weapon concepts, research the reference's high-level actuation/release, indexing, reset and resource roles. Separate verified source facts from fictional game components; no decorative substitute for missing internals.
- [ ] Correct Runewinder's unresolved striker/actuation and reset presentation. Existing sidearm/rifle art remains unapproved for mechanical completeness.
- [x] Create and deliver a separate BF-AR16A-inspired necklace archergun study in standard and purple Soulflame finishes, revised to show both necklace rows and a staged arrow.
- [ ] Resolve and implement the archergun's fictional release/reset, arrow and bead-resource contract, shared-necklace interoperability, authored rig and native tests. [Proposal](https://github.com/Herbertofury/Advent-of-Ascension/wiki/Rune-Necklace-Archergun-Proposal) · [Research and gaps](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Necklace-Weapon-Mechanism-Review.md).

### Latest necklace weapon distinction · owner clarification, 20:50 UTC

- **Runewinder Archergun** is the named arrow weapon. Base: only an arrow through the barrel, propelled by bowstring and fictional rune-striker/bead impulse. Upgrade: recessed TOP arrow channel plus a separate free BARREL projectile, firing simultaneously on one accepted event. Not either/or and not a delayed second shot. Existing top-channel artwork represents the upgrade; a matching base concept remains open.
- **Rune Bead Bow** is a separate arrowless BF-AR16A-inspired weapon with a narrow central visible bead rail and middle loading layout. The latest request adds a shoulder stock and gun-style trigger without replacing that silhouette or importing Runewinder's side-window reload.
- [x] Deliver the recessed-arrow upgrade concept and the bead bow's stock/trigger hybrid concept; preserve earlier studies.
- [ ] Author/test the actual actuation, necklace return paths, string clearance, loading, resource costs and native behavior for each separately. [Archergun contract](https://github.com/Herbertofury/Advent-of-Ascension/wiki/Rune-Necklace-Archergun-Proposal) · [Bead bow contract](https://github.com/Herbertofury/Advent-of-Ascension/wiki/Rune-Bead-Bow-Proposal).

### Rejected bow orientation and next melee pass · owner direction, 21:09 UTC

- [ ] Correct Rune Bead Bow v2: its viewing orientation and stock placement were rejected. The long reference rail extends rearward toward the shooter. Five actual manufacturer views are now collected, including shooter-side and feed/release close-ups; enclosed internals remain unverified. A corrected image request produced no image, so the bow is NOT fixed.
- [ ] After the bow correction, audit ALL mace/maul and large melee concepts for unintended bending and create a new, more faithful premium sci-fi concept for each. Preserve original identity, proportions, material cues and earlier art as alternates.
- For EVERY new weapon, gather multiple actual reference angles, establish shooting/striking direction and handling, and review documented visible internals BEFORE generation. Do not label unknown internals as researched facts.
- Never bend, curve, shorten or warp a weapon simply to fit the picture. Change canvas, framing, camera or uniform whole-object scale instead. Preserve intended natural curves, such as bow limbs, while rejecting accidental distortion of straight shafts, rails, barrels, handles and mauls.


### Verified continuation · 2026-10-29

- [x] Publish five revised straight-shaft science-fiction maul concept candidates: Coralstone, Crystal, Electron, Horizon and Vulcammer. [AoA source checkpoint](https://github.com/Herbertofury/Advent-of-Ascension/commit/05687c7ae545bcc2b9f2744eda3880f62bcf1e4e). Earlier artwork remains available; 429 other registry entries are unchanged. Pages passed and all 11 changed served files match the committed bytes. Art/native acceptance remains open.
- [ ] Hold further large-melee publication until the rejected bow orientation is corrected or the owner explicitly changes that order. The five-maul publication happened before this dependency was resolved; it is candidate-only and does not establish bow, reload or native acceptance. Preserve the three later delivered melee candidates without publishing them yet.
- Atlas [security evidence checkpoint](https://github.com/Herbertofury/Engineering-Atlas/commit/0f03be4d33c4aaf10e2131096e3c6776fb74e1f2): five new RustSec advisories reviewed; three exact Atlas lockfiles audited against database revision ee1a49a2769a24a596afc1c20cb33748d2769586, with zero known matches and no warnings. CI and Pages passed. Scope excludes other projects and any general security guarantee.


### Atlas implementation continuation · 2026-10-29 evening

- [x] Publish and verify [bounded archive-byte retention](https://github.com/Herbertofury/Engineering-Atlas/commit/a22124db0c020abc93e3a6876df83837cc80311c), [overview polling recovery](https://github.com/Herbertofury/Engineering-Atlas/commit/8a1df7923c70c231023f78e3f52e0d6b2bccac28), and [bounded saved-version reads](https://github.com/Herbertofury/Engineering-Atlas/commit/555d4ead68f606a586c956192eaa5c89abd9836d). Exact remote blobs, Linux/Windows CI and Pages verified; local HTTP and complete-data regression evidence retained. These are scoped hardening changes, not universal performance or browser acceptance.
- [x] Retain [mixed public-body controls and the isolated length-hint candidate](https://github.com/Herbertofury/Engineering-Atlas/commit/acea8481b1345903fef43f28325a119de759ab8e). All bytes match, but timing/RSS results are mixed; no candidate promotion or other-project recommendation.
- [ ] Finish verification of [v13 player-readiness status](https://github.com/Herbertofury/Engineering-Atlas/commit/1f23819b429a0e8d033b85db5555933f5413c6e8). Seven controlled player tests pass; actual browser-loaded identity/playback remains blocked. Preserve autoplay-off behavior and historical playback evidence without relabeling it as v13 acceptance.
