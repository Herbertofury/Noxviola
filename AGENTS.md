# Repository instructions

Read `.agents/athena/AGENTS-adapter.md` for the pinned shared engineering core.
Keep this file and nested instructions project-owned: setup, commands, constraints and acceptance belong here.

## Public index boundary

- This repository is a public project-memory and to-do index, not an implementation or raw conversation store. Keep code, research, artifacts and raw test evidence in the owning project repository, linking them here.
- Preserve owner-authored accountability records and current pauses. Do not rewrite failures into achievements, erase unfinished acceptance gates or treat a checkpoint as full delivery.
- Use .agents/skills/project-checkpoint-reconciliation/SKILL.md when reconciling TODO.md, DECISIONS.md and project status. Shared instruction updates belong in Athena; project details remain local.
- Engineering-Atlas and Feature-Foundry are migration/provenance sources; route new engineering work to Athena. Do not delete or archive sources, or declare retirement safe, before all migration gates are verified.
- Never publish credentials, private account/application details, raw conversations or confidential material. No email or other communication permission is implied by an index task.

## Mandatory pre-release optimization gate

Before finalizing every release, follow the owner-mandated [Athena zero-loss pre-release optimization standard](https://github.com/Herbertofury/Athena/blob/main/guidance/PRE_RELEASE_OPTIMIZATION.md). Evaluate shrink-anything, fast-anything and rust-anything using reviewed pinned tools in isolated worktrees; run applicable passes, compare equivalent complete workloads, keep only independently verified improvements, restore rejected changes, and record per-tool evidence or explicit inapplicability/blockers. Never weaken tests, delete required content, force a Rust rewrite or regress functionality, quality, portability, compatibility, security or protected performance metrics. Data/documentation-only releases and existing native Rust paths require honest applicability decisions, not artificial ports. Existing local and pinned governance requirements remain intact.

## Mandatory CLI-first / non-interruptive execution

For every task, follow the owner-mandated [Athena CLI-first execution standard](https://github.com/Herbertofury/Athena/blob/main/guidance/CLI_FIRST_EXECUTION.md). Prefer fast official CLI/headless commands, supported APIs/SDKs/connectors and tested local automation. If a required application has no usable structured interface, discover or build a reviewed [CLI-Anything](https://github.com/HKUDS/CLI-Anything) harness over the real supported backend (or a native command surface for first-party code). Use isolated browser/renderer/test sessions for necessary UI proof. Never take over the user's active desktop, mouse, keyboard, focus or browser profile without explicit authorization for unavoidable foreground interaction. Preserve real runtime acceptance, data, permissions, feature parity and portable mode. Record reusable command coverage and unresolved gaps; no fake CLI parity or unnecessary release delay.

## Athena Engine Foundry — shared game-engine source of truth

Before creating or materially changing card-game rules, deckbuilding, roguelite runs, survivor combat, encounter/reward systems, mascot actors, open-world simulation, vehicles, missions, save progression or game runtime/rendering, consult [Athena Engine Foundry](https://github.com/Herbertofury/Athena/blob/main/docs/ENGINE-FOUNDRY.md), its [package catalog](https://github.com/Herbertofury/Athena/blob/main/engines/catalog.json), and [M5 issue #365](https://github.com/Herbertofury/Athena/issues/365). Reuse or improve the strongest verified compatible engine; contribute generic improvements and fixtures back to Athena. Keep this repository's unique content, UI, balance, assets, saves and host adapters local. Do not create a parallel engine or independently edit an immutable Athena intake snapshot. Consumers must pin an exact local package/source digest, pass their own full acceptance and retain rollback; no application runtime may depend on an online Athena service. A source candidate or prototype is not a verified engine release.
