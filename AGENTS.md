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
