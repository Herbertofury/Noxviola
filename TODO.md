# Active project work

Updated 2026-10-27 UTC. This is a continuation index, not a replacement for project-local plans.

## Advent of Ascension

[Repository](https://github.com/Herbertofury/Advent-of-Ascension) · [Weapon concepts](https://herbertofury.github.io/Advent-of-Ascension/weapon-concepts.html) · [Wiki](https://github.com/Herbertofury/Advent-of-Ascension/wiki)

- [ ] Reconcile the complete native weapon registry with concept coverage, requested revisions and implementation gates. Do not call image coverage native gameplay completion.
- [ ] Continue outstanding weapon concepts, starting with Baron SSR and the next unfulfilled weapon-specific request after inspecting existing assets.
- [x] Keep Blast Cannon's new design separate from Blast Barrel. Published concept checkpoint: [f069d88](https://github.com/Herbertofury/Advent-of-Ascension/commit/f069d882223b23c0de3b689f48b1d9c0d6af1a3e).
- [x] Blast Barrel concept: one upper and two lower side-by-side barrels; earlier versions retained at the same checkpoint.
- [ ] Finish per-weapon lore, native behavior comparison, supply path, ergonomics, animations, attachments, tracer/projectile/impact/death effects, skins, charms and QA documentation.
- [ ] Continue models and animation only within their approved scope. Preserve specifically paused native/rig tasks.
- [ ] Verify each weapon in its pinned native stack before marking runtime gates complete.
- [ ] Boom Boom main redesign remains unresolved; existing concept retained. Pig and creeper-pig accessory concepts are separate, not a replacement main weapon.
- [x] FM-9D inspiration reference added to the AoA inspiration wiki; video reference is not footage-level mechanism verification.

## Engineering Atlas

[Repository](https://github.com/Herbertofury/Engineering-Atlas) · [Evidence](https://github.com/Herbertofury/Engineering-Atlas/blob/main/docs/experiment-evidence.md) · [Wiki](https://github.com/Herbertofury/Engineering-Atlas/wiki)

- [ ] Continuous bounded research and actual implementation improvements, not idle checks alone.
- [ ] Finish receipt-gate repair publication verification and CI for [e9ee647](https://github.com/Herbertofury/Engineering-Atlas/commit/e9ee6473bf21b3f69c6d6726f17a0789b92a96b1).
- [ ] Expand permitted real-source adapter coverage and complete media/card tests; distinguish fixtures, public, authenticated, player-ready and actually-playing.
- [ ] Close native UI, input/scroll latency, process-memory and end-to-end measurement gaps.
- [ ] Diagnose retained parser tail regressions and evaluate representative larger inputs before promotion.
- [ ] Continue durable-write/storage and worker-count comparisons with full-data parity and bounded resources.
- [ ] Review and test candidate techniques before ranking or adoption. Keep failed evidence and last-good versions.
- [ ] Publish findings to another project's wiki/TODO only after comparison against that project's actual current implementation proves improvement without sacrificing requirements.

## Completion standard

Every active item should have a concrete next step, evidence link and honest status. Reconcile this index with project-local work before starting, avoid overlapping active passes, and update it when verified milestones or blockers change. Do not infer permission to resume paused work or modify unrelated deployments.
