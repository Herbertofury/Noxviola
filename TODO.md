# Active project work

Updated 2026-10-27 UTC. This is a continuation index, not a replacement for project-local plans.

## Advent of Ascension

[Repository](https://github.com/Herbertofury/Advent-of-Ascension) · [Weapon concepts](https://herbertofury.github.io/Advent-of-Ascension/weapon-concepts.html) · [Wiki](https://github.com/Herbertofury/Advent-of-Ascension/wiki)

- [ ] Reconcile the complete native weapon registry with concept coverage, requested revisions and implementation gates. Do not call image coverage native gameplay completion.
- [ ] Continue outstanding weapon concepts, building on existing assets rather than duplicating completed concepts. Baron SSR's cosmetic study is now published; next review covers Golder Bomber's remaining customization.
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

- Complete AoA wiki task reconciliation: [740816a](https://github.com/Herbertofury/Advent-of-Ascension/commit/740816adc69e1b9719e9c2a1058f61643a59cda4), 496 pages / 1,298 source tasks. Eight maintenance tests and the local drift check passed; remote CI pending. Source checkmarks are not native completion.

## Completion standard

Every active item should have a concrete next step, evidence link and honest status. Reconcile this index with project-local work before starting, avoid overlapping active passes, and update it when verified milestones or blockers change. Do not infer permission to resume paused work or modify unrelated deployments.
