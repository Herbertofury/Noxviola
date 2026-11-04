# Sims project delivery retrospective — 2026-11-04

## Outcome and accountability

Apex, external CAS, and the standalone Foundry game controller were not delivered as complete, in-game-qualified products. The owner had to repeat instructions and restart work. Fixture tests and documentation did not substitute for the requested end-to-end outcomes. This is a record of the assistant's execution failures, not a claim that all causes or exact usage attribution are known. No per-task credit ledger was available in this review.

## What went wrong

1. **Existing work was not recovered first.** Earlier records show real CC and pose playback, but the assistant spent time reconstructing the CAS and did not promptly turn the surviving checkpoints into a durable, usable, save-capable product. Some work was saved in Space while publication was blocked; a saved source bundle is not a verified working application.
2. **The known game entry method was not used promptly.** Modernize's CLI-driven EA dialog method was confirmed at 15:14 UTC; the assistant's recorded result says it pressed OK and the game started at 15:36. The CAS check then stopped before interaction over mismatched restoration records. The historical method and limited actual CAS/exit evidence existed; they should have been consulted at the first obstacle, not after repeated prompting.
3. **A session mismatch was treated too broadly.** A different current session alone does not prevent ordinary testing. Identify the active game and apply the method's actual requirements; use fresh current-session evidence where supported. An old restoration record must not be applied to another profile, but restoration and testing are separate questions. Do not invent a blanket requirement that all historical sessions match.
4. **Task status and ownership were mishandled.** The assistant reported Apex as active after the turn had closed, steered an active helper despite the owner's do-not-interrupt instruction, and relied on short checkpoints without consistently ensuring the next useful work was underway.
5. **Attention moved away from the main outcome.** Outage checks displaced CAS implementation, and requested research was paused. Research, coordination and incident checks must support the user's main project, not replace it.
6. **Tests were overrepresented relative to delivery.** Many offline tests and source checkpoints were produced, but a matched hitch baseline, complete game controller and fully usable external CAS remained open. Counts are not game acceptance. A historical Human CAS handshake and limited Fairy/exit cases are real evidence of those narrow paths, not proof of complete current-build behavior.
7. **Permission boundaries and the actual action were not separated early.** The assistant conflated EA's dialog with a separate access approval. Identify exactly which action was denied and what remains authorized; respect the denial without automatically blocking unrelated work or routing around it.
8. **Work was not budgeted visibly.** The weekly indicator was observed at 100% remaining before the work, and later desktop turns failed with an out-of-credits message. The available evidence does not attribute credits or money to individual tasks. The assistant should still have tracked available budget, reduced duplicated work and surfaced consumption risk sooner.
9. **Requirements were initially too vague.** A broad hybrid statement was not sufficient for implementation. Named forms, operations, preservation and observable acceptance cases had to be added later. Newer owner choices must override older UI designs.

## Required operating checks

- [ ] Before starting a new pass, inspect the latest working source, artifacts, actual current task state and existing documented methods. Identify exactly what can be used now and what is missing.
- [ ] Define one real end-to-end user flow, its observable result and its current blocker. Use the [game test runbook](https://github.com/Herbertofury/Sims4Foundry/wiki/Sims-4-End%E2%80%90to%E2%80%90End-Game-Test-Runbook) and the project owner checklists; do not silently substitute fixture tests.
- [ ] Use the current authorized session for a supported test where possible. Separate testing from any historical restoration; only the specific action's actual identity and data-preservation requirements apply.
- [ ] Coordinate one owner for shared game/profile mutations. Check terminal state directly before claiming a task is running. Respect instructions not to interrupt; resume substantive work at an appropriate closeout.
- [ ] Commit approved, non-private progress to the correct repository early; verify exact remote artifacts and retain a usable recovery route. Do not assume private data or third-party assets are safe to publish.
- [ ] Keep research and independent work moving when a step is blocked, but do not duplicate an uncertain action, evade a denial, or spend money without the required authorization.
- [ ] Before expensive parallel work, check available usage where possible, define non-overlapping outcomes and coordinate shared resources. Report actual observed limits and tradeoffs; never invent a per-task cost.
- [ ] At each checkpoint state what is actually working, how it was tested, the exact next end-to-end step and any real blocker. Keep historical evidence, current fixture evidence and current in-game evidence distinct.
- [ ] Do not mark a requirement complete until its specific acceptance case passes. Preserve failures, last-good states and rollback evidence.
- [ ] Revisit this list after the next real game run and update it with evidence of which corrections worked and which still failed.

## Research informing the correction

- [Google SRE: Postmortem culture](https://sre.google/workbook/postmortem-culture/) explains why corrective actions need clear owners, priorities and verifiable outcomes rather than vague promises.
- [PresentMon trace consumer](https://github.com/GameTechDev/PresentMon/blob/main/PresentData/PresentMonTraceConsumer.hpp) documents event-buffer overflow and ordering boundaries. A capture with lost telemetry must not be used as proof of a hitch-free baseline.
- [Foundry's historical controller handoff](https://github.com/Herbertofury/Sims4Foundry/blob/ff89a735d932542a5647ce19352ec0404fb693d9/tooling/game-cli/docs/CONSUMER_HANDOFF.md) distinguishes the documented existing Apex-backed methods and narrow real-game evidence from the not-yet-qualified independent controller.
- [Foundry game test runbook](https://github.com/Herbertofury/Sims4Foundry/wiki/Sims-4-End%E2%80%90to%E2%80%90End-Game-Test-Runbook) records the concrete launch, CAS, Live, Build, exit and repeat workflow, including remaining gaps. A guide is not a completed test.

Keep this public index free of credentials, account details, private saves, raw transcripts and private assets. Implementation and evidence stay in the respective project repositories.
