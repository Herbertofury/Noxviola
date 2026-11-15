# Requested work and delivery milestones

Reconciled 2026-11-15 UTC. **Request reconciliation, not a claim that every project has been verified complete.** Visible human requests were reviewed back to the beginning of the conversation; current project acceptance still needs gate-by-gate verification. This is the public project index; private tasks, account details, source data and raw conversations are deliberately excluded. Existing project checklists, explicit pauses and owner-authored accountability records remain intact.

## Use this before choosing work

1. Read this index, [TODO](../TODO.md), the owning project's current instructions/checkpoint and active work. Preserve the latest user priority; claim one code path or game session, not a duplicate pass.
2. First priority: make **Modding-Knowledge's working, populated databases**, while maintaining this hub in parallel. Creating a repository, writing a schema or linking sources is not that outcome.
3. Select a concrete unmet acceptance gate, implement in its owning repository, test the real affected workflow, publish within authorization and verify exact remote state. Keep local tests, merged source, deployed artifact and native acceptance distinct.
4. Update the row at a meaningful checkpoint with exact evidence, remaining gate and next action. No evidence means **verification pending**, not complete or proven absent. A blocked part does not close independent work.
5. Respect publication/access denials, specific pauses, licenses and private-data boundaries. Scheduled passes do not promise uninterrupted execution. Noxviola is an index, not a duplicate code or raw-data repository.

**Status legend:** `open` = accepted scope without completion evidence here; `active` = assigned current implementation; `verify` = inspect existing work before repeating; `ongoing` = recurring research/maintenance; `held` = requires a named condition. Check current source before acting on any snapshot.

## M1 · Dedicated, usable modding knowledge databases (highest priority)

Owner/destination: [Modding-Knowledge](https://github.com/Herbertofury/Modding-Knowledge), with navigation/consumer integration in [Athena](https://github.com/Herbertofury/Athena). Preserve provenance from the original [Athena foundation PR #174](https://github.com/Herbertofury/Athena/pull/174); it is not a substitute for the dedicated repository.

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| DB-01 | active | Dedicated public repository and live Wiki published at [a663473](https://github.com/Herbertofury/Modding-Knowledge/commit/a663473), with Windows/Linux verification reported by the delivery owner. Verify further checkpoint drift before changing it; creation alone does not close M1. |
| DB-02 | active | Inventory and reconcile existing creator/status stores, Scarlet and WCIF adapters, Minecraft SQLite knowledge/repair stores and cross-provider contracts. Preserve useful IDs/provenance/history; never publish private source or data by copying blindly. |
| DB-03 | active | SQLite/rusqlite foundation with stable entity IDs, migrations, indexed queries, durable transactions, immutable attributed observations and restart/replay tests. Benchmark actual representative complete queries/writes before calling the storage choice best. |
| DB-04 | open | **Working Scarlet ingestion**, not merely its URL: remove fixed-row truncation and silent partial-success behavior; enumerate authorized records, detect terminal/pagination coverage, retain raw permitted evidence and last-good data, deduplicate without sanitized-name collisions. Record the owner's reported permission and actual publication scope without disclosing correspondence. |
| DB-05 | open | **Working WCIF ingestion** and creator resolution: recover old implementation if present, prove current route/permission, follow canonical creator/custom-site/direct-page relationships; distinguish one source's observed count from a creator's entire output. |
| DB-06 | active | Publish and reopen real structured records. Published initial checkpoint has 115 entities and 164 observations, importer and read-only JSON query. Minecraft/Bethesda/LOOT tranches are a seed, not comprehensive coverage. Retain LOOT conditions/CRCs and label unevaluated conditions; do not turn them into blanket bad-mod verdicts. |
| DB-07 | open | Creators database: aliases, direct and custom websites, provider identities, mod relationships, source-observed counts, last release/update evidence and maintenance history. Unknown fields remain unknown; no fabricated popularity or maintenance scores. |
| DB-08 | open | Mods/compatibility database: game, edition, build, runtime/storefront, loader, dependencies, conflicts, superseded releases, fixed-in versions, reports versus confirmed defects and affected-condition scope. |
| DB-09 | open | Troubleshooting/how-to database: symptom/crash signature, prerequisites, diagnostic steps, evidence-backed solution, reversibility, provenance, affected versions and verified outcomes. Keep source claims separate from reproduced fixes. |
| DB-10 | open | Best practices/tools/known-bad methods database: explain why a method/mod is unsuitable, alternatives and specific conditions; permit informed user override rather than blocking legitimate updates based on uncertain inference. |
| DB-11 | open | App consumption: documented versioned query/export/update interfaces, pagination, incremental changes, typed errors, freshness/completeness/access states and reproducible examples. Prove at least one real consumer end-to-end; a library test is not a deployed API. |
| DB-12 | open | Multi-source automatic refresh: source registry, policy/rate limits, retry/backoff, incremental cursors, failure retention, conflicts, tombstones and non-destructive recovery. No hidden caps, private/paywalled fixture publication or access-control bypass. |
| DB-13 | open | Coverage dashboard per game/source/entity type with expected versus observed records where known, last successful/attempted refresh, partial/blocked states and missing work. Never label a stalled search exhaustive. |
| DB-14 | ongoing | Expand all requested games: Sims 4; Skyrim SE/VR; Fallout 4/VR; Starfield; Oblivion and Oblivion Remastered; remaining Elder Scrolls titles; Minecraft Java/Bedrock; Hytale; Cyberpunk 2077; Witcher 3; Terraria and other requested game families as source inventory is reconciled. Separate research scope from implemented/tested adapters. |
| DB-15 | open | Public rules/schema/data dictionary and contributor workflow; license code, factual records, model weights and third-party assets separately. Wiki explains and navigates actual databases, not replaces their contents. |

## M2 · Athena: one native app, verified migration and continuing R&D

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| ATH-01 | active | Learning, Engineering and Feature Foundry share native navigation, data and workflows, not embeds or duplicate apps. Inventory every retained capability and test cross-workflow use. |
| ATH-02 | active | Engineering-Atlas retirement: reconcile source/history/wiki/evidence/drafts/artifacts, links and remaining dependencies; verify restoration, final remote blobs, CI, served assets and loaded harness. Give its own deletion-readiness verdict only after all gates pass. Preserve source. |
| ATH-03 | active | Feature Foundry retirement: reviewed public source/history, excluded secrets/private data/unlicensed assets, restored backups and full capability parity including cinema/ecology/authored transformations/filters/physics as applicable. Owner-data migration or proven absence, native owner-device acceptance and dependency audit remain separate. Preserve source; never delete it on the owner's behalf. |
| ATH-04 | ongoing | Real usable reusable app foundations across apps, games, mods and browser extensions. Inventory existing adapters/maintained upstream code before replacing; official releases, GitHub/Codeberg, papers and advisories inform candidates, not superiority claims. |
| ATH-05 | ongoing | At least daily deeper bounded regressions: card visibility/density, input/scroll latency, memory, complete storage/durable writes and equivalent-work end-to-end performance. Retain failures and last-good baseline. Repair promising unstable candidates in isolated R&D before promotion. |
| ATH-06 | open | Real mod/game/media cards: decoded source-owned images, galleries, metadata/attachments and official playable audio/video. Explicit fixture/public/authenticated/player-ready/actually-playing states; autoplay off. |
| ATH-07 | ongoing | Dedicated provider research: Patreon, Afdian, YouTube, Bilibili, X, Facebook, Discord, Steam, SteamDB reference-only, CurseForge and Nexus grouped Skyrim SE/Fallout 4/Starfield; expand established families. Browser login is not an app API grant. |
| ATH-08 | open | Learning routes: Google IT Support; A+, Network+, Security+; CCNA; AWS Cloud Practitioner/SAA; Azure AZ-900/AZ-104; Terraform Associate; PL-300; RHCSA; CKA. Current official objective mapping, original teaching/questions, practical labs, coding practice, shared knowledge, progress and accessible interactive app. Existing lessons do not prove exhaustive exam coverage. |
| ATH-09 | ongoing | Source-linked design analysis and practical implementation guidance: kshv.me/kshvbgde, official Three.js, bencho.dev, bestsaasdesigns and bestsaaswebdesigns.com. Preserve favorites and evaluate real usefulness. |
| ATH-10 | held | Reconcile pending PRs individually with current exact-head CI and authorization. Do not repeat denied uploads or infer full native acceptance from a merged regression fix. See owning repository's current open PRs. |

## M3 · Athena PC catalog, cybersecurity and reversible optimization

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| PC-01 | ongoing | Expand existing 66-tool cleanup survey rather than replace it. Cover cleanup/disk/cache/worktrees, uninstallers, processes/startup, backups, files/search, productivity/QoL and diagnostics across GitHub, GitLab, Codeberg and official vendors. |
| PC-02 | ongoing | Security: process/module/handle/attachment and injection inspection, malware triage, scanners and response tools including Tron/Malwarebytes examples. Distinguish observation, suspicion, confirmed detection and remediation risk; no automatic destructive cleaning. |
| PC-03 | ongoing | Creative categories: photo/raster/vector, video editing/compositing/encoding, audio/music, 3D/Blender/modeling/sculpt/mesh/UV/material/texture/rig/animation/asset creation, game engines and modding tools. |
| PC-04 | ongoing | Browsers, coding/build/debug/profiling, AI agents, memory tools and AGENTS.md/SKILL.md practices. Source-backed setup, hardware/Windows support, maintenance, code/model-weight licenses and reuse versus inspiration. |
| PC-05 | active | Sortable accessible tables: GitHub stars with snapshot date, attributed user ratings with source/scale/sample count/date; non-GitHub or unrated tools remain meaningful missing data, not zero. Test filters, sorting and navigation on final served build. |
| PC-06 | ongoing | Several recent/bleeding-edge candidates per category with official date/version/source and experimental flags. Separate measured quality/effectiveness from stars or reviews; do not promise discovery of every tool in existence. |
| PC-07 | open | Windows guide: Everything versus Windows indexing, taskbar End Task, startup/services, cleanup, power plans, CPU/GPU and diagnostics. Prerequisites, tradeoffs, rollback and before/after measurement; no blanket service disabling, registry-cleaner promises or unrequested settings changes. |
| PC-08 | ongoing | Hourly refresh requested: both meaningful updates and new findings, deduped against active work; update live Wiki and repository source together, verify publication. Notify on meaningful verified pass completion, not exhaustive universal completion. |

## M4 · Sims products: Apex, External CAS and Sims4Foundry

Current ownership must be checked before touching the game or another worker's code. Recover accepted source/assets/checkpoints instead of starting over. Native tests use the actual final installation; performance comparisons need equivalent work, while ordinary functional testing need not wait for artificially identical sessions.

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| SIM-01 | open | Apex: isolate and causally remove CAS/live-mode hitching/freezing with full features retained. Rebuild incrementally from preserved baseline, inspect game/mod hot paths, measure startup/interaction/frame times, representative large CC loads and total CPU/GPU/memory cost. No feature cuts or cache-only substitution. |
| SIM-02 | open | Integrate current Dynamic CAS feature set; preserve bottom size/column sliders, smooth integrated expand/collapse and heart favorite filtering inspired by the accepted UI reference. |
| SIM-03 | open | Repair instant search-as-you-type, current-outfit selection and all-equipped-CAS-item visibility. Add go-to-selected with visible pulse and return-to-prior-scroll toggle. |
| SIM-04 | open | Shared search/tooltip index: package, folder, author defaults; global visible-field toggles, per-item editable fields/notes and disable option; no duplicated scans/hitching. |
| SIM-05 | open | Full hybrid/form requirements from project-local checklist; features independently disableable/removable, not all coupled to hybrid support. Preserve powers, needs, form data, saves and gameplay. |
| SIM-06 | open | Animated ears/wings/tails across human and occult forms: all requested SpinningPlumbobs wings including eight optional packs, animated tails and SDMSims tailmod2. CAS, WickedWhims body selector and creator menus respect each other's selection; enable simultaneous wings/tails/ears with version/license/runtime verification. |
| SIM-07 | open | External CAS: actual game-based room/UI/animated Sim, skin/eyes/tattoos/hair/clothes/occults and modded CAS-room content. Read lawful installed resources; no redistributing game assets or gray placeholder substitution. |
| SIM-08 | open | Render real CC LRLE/RLE and color-slider content, swatches/color wheel, detailed sliders; multi-CC tests, large collections, folder/author/color/type filters and responsive search. |
| SIM-09 | open | Tray import/export, outfit creation/editing and durable save/close/reopen; undo/redo/history/favorites/saved outfits shared coherently with in-game Apex; open package folder/S4Studio. |
| SIM-10 | open | Poses/animations from permitted pose mods: searchable menu/dropdown, faithful playback, no unlicensed redistribution. |
| SIM-11 | open | Explicit independent/offline, CAS-sync and live-sync modes. Game launch must not steal an unrelated editing session. Household/Sim selection, apply edits to current live Sim, conflict/reconnect/undo behavior and switching across large families. |
| SIM-12 | open | Sims4Foundry complete repeatable launch/load/CAS/live/build/save/exit/test automation using supported CLI/bridge methods; reuse prior working native flow. One game-session owner, preserved installation and no unapproved security changes. |
| SIM-13 | ongoing | Analyze maintained Sims4Studio, Tray Importer, GameTimeDev manager and compatible mods as baselines; reuse where licensed, prove real target gains. Keep known failures and reproducible native test instructions in owning repos. |

## M5 · Modding tools, launchers, preview and game integrations

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| MOD-01 | open | MO2R end-to-end functional polished release with full features, instant responsive UI and representative stress test on the authorized large Skyrim profile. Evaluate native Rust/Qt alternatives empirically at no loss; no forced Tauri/React choice. One current owner. |
| MOD-02 | open | Native agent management/update/repair workflow, not an external plugin-only solution; inventory existing MO2 integration foundations and full CLI/API behavior. |
| MOD-03 | open | Integrated remembered FOMOD installer choices and polished update/reinstall workflow; preserve existing profiles/mods and the relevant installed plugin's useful behavior. |
| MOD-04 | open | Bugs column per mod with separate official bug counts, comment-detected reports and repository/other official reports; hidden/unavailable states. High/hidden red, low orange, no-reported green **with explicit unknown distinction**, not false safety. |
| MOD-05 | open | Bug checks on first download/update or explicit right-click menu; menu includes bugs, CTDs, issues and full summary. Track fixed-in version, author/user solutions and provenance; don't rescan continuously. |
| MOD-06 | ongoing | Modhunter/MO2R/GameSync update tracking: evaluate Whimwatch-style user-added pages, supported persistent sign-in, actual update identity and failure recovery; preserve active ownership. |
| MOD-07 | open | Skyrim Mod Workbench full tool workflows: xEdit, LOOT, ESL tooling, Creation Kit/CKPE and maintained save/asset tools. Real read/edit/save/validate transactions and rollback; Bruma dependency migration example, safe ESL qualification, no false compatibility veto. |
| MOD-08 | open | Hover usable installed/taskbar app in sync with releases, low-resource instant preview, no file locking, remembered view, side-by-side multi-select, explanatory tooltips, preview shelf and copy-relevant-data. |
| MOD-09 | open | Hover per-game wiki/milestones and format matrix: Sims packages/tray Sims/households/lots with CC discovery, swatches/rotatable CC; Bethesda archives/textures/meshes/audio/saves with thumbnails; Java/Bedrock packs/worlds/schematics; Blender/assets; Hytale; Unreal/Unity; Cyberpunk/Witcher/Oblivion/Terraria, Stardew Valley and Baldur's Gate 3. Compare best native viewers and distinguish parsed versus rendered formats. |
| MOD-10 | open | Enderloom installed titlebar/tabs/maximize and taskbar-version parity; addons/datapacks as functional/gorgeous as mods (update/delete/providers/drag-drop), compact controls, grouped configs and accurate provenance rather than loose unknown files. |
| MOD-11 | open | Enderloom complete instance/modpack/config identification with real speed improvement and full results; worker counts tested, media background off by default. |
| MOD-12 | open | One current TaCZ/AoA test instance with requested Armorer/BlueArchive/Cataclysm packs/dependencies and latest authorized Hari/Vulkan. Repair renderer incompatibility at its causal owner; native gameplay/visual/FPS checks and preserved essential saves. |
| MOD-13 | open | Enderloom Horizon/Rust Minecraft research and installable/moddable versions; ambition for cross-version Fabric/Forge/NeoForge testing/repair remains unproven until compatibility demonstrated. Do not describe research as universal mod support. |
| MOD-14 | open | Minecraft mod knowledge consolidation: recover sheets/HTML/docs into organized category wiki, favorites and forever-world compatibility collection; preserve source provenance, merge with dedicated database rather than create another disconnected catalog. |
| MOD-15 | open | Games Steam integration: real authorized account sync/backend, owned/wishlist/playtime filters, accurate wishlist operations and local-data preservation. Simulated provider tests and store links are not live sync or confirmed wishlist mutation. |
| MOD-16 | verify | GameSync/Next remaining product consolidation and large-card/library/adapters workflows: inspect canonical roadmap/current owner, keep existing progress and reuse database contracts without duplicating the ongoing implementation. |

### Additional distinct modding milestones recovered from earlier requests

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| MOD-17 | open | Enderloom Studio A/B: two actual clients side-by-side across versions, window/maximize/borderless controls, meaningful asset/code comparison. Drag an item/block between clients, show live preview plus conversion progress, build the destination JAR, let user batch work before restart, then prove native destination behavior. No universal conversion claim from a preview. |
| MOD-18 | open | Enderloom lawful Bedrock marketplace browsing, official purchase/download route and reviewed authorized importer foundations; Java↔Bedrock conversion with Actions & Stuff 1.11.1 as requested trial where rights/routes permit. Owner-reported permission is not permission to bypass DRM/access controls. |
| MOD-19 | open | Minecraft-Vulkan-Hybrid/Hari: recover ProjectDump lineage, actual modpack compatibility, cold/warm startup and FPS/frame-time improvements, full Oculus-style settings and optional Caustica ray tracing subject to verified compatibility/license. No gun-side workaround masking a renderer defect. |
| MOD-20 | verify | GameSync/Next full best-of-both feature merge, latest suitable stack and source/Wiki parity; recover Petz work, finish it and qualify requested Opera GX install. Existing local/remote state must be inspected before adding another implementation. |
| SIM-14 | open | Apex F11 complete tray browser: Sims/occult information, copy to current/other Sims, referenced CC, correct EA/CAS thumbnails and all equipped categories including skin details, package/folder/Studio actions, slider values and conflict diagnostics. |
| SIM-15 | open | Apex explicit special states: ghost, scarecrow, reaper and PlantSim alongside native/custom occult forms; edit/switch forms in CAS without losing traits/powers/needs. Reconcile exact native/custom combinations in project checklist rather than a vague hybrid promise. |
| SIM-16 | held | TS4-Accelerator: engine/mod loading and actual FPS/lows with very large CC collections, binary-based causal analysis, suitable Rust substitution and full feature parity. Full-build/native-test pause pending Apex must be reconciled before resuming; research is not a verified speedup. |
| SIM-17 | held | Runtime hair physics for existing/CC hair without manually editing each item; separate project using reusable bridge infrastructure. Owner said leave it as-is October 8; do not silently resume native work. |
| SIM-18 | held | FalseHope LoveBites latest-game update in Sims4Foundry: recover preserved work and native test evidence; owner stopped that chat October 14. Research/foundation work does not revoke that pause. |
| SIM-19 | verify | Requested color-slider installation/repair: reconcile actual official version-specific instructions and preserved previous install; do not overwrite a newer installation or use unrelated classic/pancake instructions. |

## M6 · AoA restoration, weapon acceptance and JetSetCraft

[Existing detailed AoA obligations](../TODO.md#advent-of-ascension) and its [weapon backlog](https://github.com/Herbertofury/Advent-of-Ascension/blob/main/docs/Weapon-Upgrade-Backlog.md) remain canonical. Do not reset accepted concepts to unfinished merely because implementation is incomplete.

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| AOA-01 | open | Complete all-era restoration/progression, original/current content union, compatibility/migration/multiplayer and native acceptance; do not confuse the 228-ranged first lane or 434-concept registry with total delivery. |
| AOA-02 | open | Finish no-artwork gaps and requested per-weapon corrections, preserve alternate concepts, lore/source dimension and original behavior/projectile comparison. Audit every named request against the existing concept ledger. |
| AOA-03 | open | Accepted concepts become game-ready TaCZ/AoA vertical slices: professionally refined mesh/textures/moving internals, first/third-person holding/reload/inspect, correct trigger/hand clearances and no shrinking/warping hands or bending weapons to fit artwork. |
| AOA-04 | open | Every weapon: supply path, firing/reload interruptions, sounds, muzzle/tracer/projectile/impact/death effects, recoil, attachment behavior, textures, performance and native evidence. Optional reload where mana resources make it appropriate. |
| AOA-05 | open | Modular scopes/barrels/magazines/muzzles/handling/silencers, dismantled transferable effects, earned stat-affecting charms, skins/stickers/animated emblems and optional ammo counters; coherent visuals and gameplay, source licensing checked. |
| AOA-06 | open | Runewinder sidearm/rifle, separate bead bow and Archergun base/upgrade: corrected shooter orientation, one transparent rotating sleeve, persistent bead sequence/type/count/charge, mana recharge and partial-recharge candidate integration. Preserve distinct arrow/barrel behavior and alternatives. |
| AOA-07 | open | Requested compatibility: TaCZ, Apotheosis, L_Ender's Cataclysm, Butchery, Alex's Mobs, Farmer's Delight, Kaleidoscope Cookery, Create, Botania, Applied Energistics, Gateways to Eternity, Scorched Guns, Terramity, Malum, Ars Nouveau, Born in Chaos, Aether and popular dimensions. Extend realmstones and turret support with version-specific tests. |
| AOA-08 | open | Gorgeous complete wiki/tutorial/bestiary: dimension/biome/version filters, mob images/drops/loot, weapons lore/mechanics, guides and comparisons; accurate navigation and live Wiki/Pages parity. |
| JET-01 | open | JetSetCraft/Rival Rush unified music catalog/wiki by artist/album/game/gang with official purchase/download links, every requested track reconciled, credit/permission evidence and no unauthorized audio redistribution. |
| JET-02 | open | Requested NPC visual quality and skating-reactive hair/cloth physics using the chosen compatible model system; preserve gang-specific art and existing gameplay milestones. |

### JetSetCraft detailed gameplay milestones

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| JET-03 | open | Gang-control loop: Gabberinas compete for mob-gang territory, borrow controlled mobs' abilities, lose those abilities when control is taken, and can surprise-challenge after normal events. Honkistas add a rarer harder follow-on encounter with transformed music. |
| JET-04 | open | Preserve selected gang identities and unlocks: Cumbias, Phonkistas, Gabberinas, Hardtekkas/Tekkistas, Industrials, Krumpaz, Footworkas, Honkistas, MoccaSins (Thundersteps/Drumrunners/Neon Shawls/Rhythm Daughters/Powwow Dreamers as appropriate unlocks). Reconcile dance/costume/music source references and culturally informed characterization. |
| JET-05 | open | Mob gangs for current/planned vanilla mobs plus Aether/Midnight/Cataclysm and chosen mod families: individual music/dance/art, quirks, abilities, unlocks and genre-specific leaders; group choreography during skating and normal dancing. |
| JET-06 | open | Memorable recruitable characters with high-reputation challenger unlocks, defeat-to-recruit and skins; review requested references/likeness permissions before actual reuse. CPM-quality models, animated hair/clothing and source-linked design evidence. |
| JET-07 | open | Terrain/biome-aware temporary circuits/arenas with safe non-destructive restoration, biome materials, lava/ice/cave obstacles, underwater skating, platforming/tagging races and boss events; prevent damage to user builds. |
| JET-08 | open | Modes: CTF, king-of-the-hill and related arena play, accelerating survival waves, runner/obstacle and box/coin challenges. TaCZ combat with tricks replenishing ammo; user-selectable vanilla-compatible versus skating-focused movement. |
| JET-09 | open | Music-aware combos and introductions, now-playing artist/title, radio/authorized Spotify integration, beat-responsive nighttime lights/lasers and reactions; Nether/End rave environments. Source rights and actual service API support remain separate from enthusiasm/permission reports. |
| JET-10 | open | Ride customization: wheels/gears/boards/engines/trails, colors/art/tagging/names and enchanting-table support. Snowboard, wingsuit, skis, ice skates, mountain bike, aquatic carveboard, mountainboard and earned customizable boostpack. Wingsuit uses elytra and combines with rides/boostpack. |
| JET-11 | open | Create-first train/minecart tricks, skins, rival/mob train battles and rail-side grinding across vanilla/modded tracks, informed by Denshattack. Research installed behavior lawfully; no copying protected code/assets without permission verification. |
| JET-12 | open | Version sequence **1.20.1 → 1.21.1 → latest**, eventually broader versions with reusable version adapters and actual tests. The earlier 1.12.1 statement was corrected by the owner. |

## M7 · Cross-project continuity, delivery and smaller unfinished requests

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| HUB-01 | active | Reconcile accessible conversation from start to end, deduplicate with existing repository lists, preserve private tasks privately and explicitly log inaccessible attachments/history gaps. This document is the working index, not proof the review has finished. |
| HUB-02 | ongoing | Every repository has specific actionable milestones/to-dos and current competitor/alternative/base-library research with license, compatibility, concrete reuse ideas and measurable comparison gates. Avoid vague “make better” tasks. |
| HUB-03 | open | Shared Agent-Foundry core synced via pinned AGENTS.md/CLAUDE.md adapters, **plus relevant project-specific skills**, while local details stay local. Preserve separable features and the accepted agency mindset. Audit coverage/drift; do not edit managed snapshots ad hoc. |
| HUB-04 | open | Computer-Link usable non-agent-usage computer interaction/inspection, public repo/live wiki, scoped secure bridge and actual end-to-end client test. Transport research/foundation is not a working connection. |
| HUB-05 | held | OpenCode Desktop Windows official architecture/version/install/size verification and isolated pinned MemPalace pilot if existing prerequisites suffice. Native machine availability and actual installer tests needed; no unrequested sign-in, plugins, model downloads or security changes. |
| HUB-06 | open | CrownFold full playable polished game and Rust candidate evaluation. Preserve earned gear above 100 on save/reload; source/tests, offline delivery artifact and runtime acceptance are separate gates. |
| HUB-07 | open | MediaForge ZIP Windows-reserved-device-name repair: preserved tested candidate, publication remains a distinct held gate. No reattempt through another route after a denial. |
| HUB-08 | verify | UltraDeck and Skyrim Mod Workbench recent regression deliveries: retain exact owning-repo tests/commits; assess remaining product backlog rather than reopen already-fixed issues. |
| HUB-09 | held | Scoped workspace cleanup/backup consolidation: retain previous pauses, avoid unrelated deletion/moving burden to another drive, verify deduplicated TAR+Zstandard restore/space results and specific destructive approvals. |
| HUB-10 | verify | Security-download audits (Twitch Drops Miner and requested survivor games): reconcile delivered hash/scan/static/runtime evidence before closing. No scan establishes universal safety; no permission to execute an unrecognized binary inferred. |
| HUB-11 | ongoing | Most frequent supported scheduled continuation requested after backlog publication: check hub/owners, advance highest-priority permitted work, record evidence and avoid duplicate overlapping passes. Root scheduling owns this, not this index itself. |

## M8 · Recovered projects and catalog organization

| ID | Status | Required result and next acceptance gate |
|---|---|---|
| REC-01 | open | Bloom & Boom: latest working polished mod, actual in-game screenshot evidence, preserved concept collection and Minecraft Dev Kit improvements. Correct shroomlight/froglight variants after mushroom while leaving cat design alone; refined textures/mesh, proportional flowers, 3D blinking lashes, all-around crown and hair/vine integration. |
| REC-02 | open | Bloom & Boom cow family: MooBoom baseline, Dairy Dynamite theme/explosion and Bovinova purple nova variant/explosion. Preserve official **Bloom & Boom** name rather than Creeperella subtitle. |
| REC-03 | open | Hearth & Haul: recover existing backpack work, public repo/live Wiki, Sophisticated Backpacks/Storage compatibility, mob variants and enterable dimensional backpack/home gameplay. |
| REC-04 | verify | Minecraft Dev Kit: recover current implementation and strengthen actual development/modeling/render/game-test workflows for Bloom & Boom/AoA; no substitute screenshots from concept art. |
| REC-05 | open | Existing Minecraft catalogs: locate original sheets/HTML/docs, preserve identities, fresh research per category, synchronized data/interactive HTML with comparison and consistent fun responsive UI. Do not create disconnected replacement catalogs. |
| REC-06 | open | Chat/project organization: reconcile project chats into existing appropriate folders, preserve explicitly retained game-discovery chat and organize progress/file links in the existing project dashboard/HTML/sheet. Personal links stay private; archive only within current authorization. |
| REC-07 | verify | Drive project consolidation and checkpoint recovery: useful GameSync/JetSetCraft research goes into owning repos, consolidate duplicate folders without losing unique artifacts. Verify empty/redundant status and approvals before irreversible deletion; do not publish private Drive URLs. |
| REC-08 | held | Owner's Skyrim installed-mod audit was stopped October 8. Preserve keep/update/remove recommendations as a pending review request, not authority to change the installation or resume the paused audit. |

## Review coverage and limits

This update was reconstructed from current owner messages and paginated conversation history, then reconciled against the existing public index. Historical owner requests are not proof of current completion. Rows marked `verify` require current owning-project evidence before a completion/unfinished verdict. All old TODO text remains preserved below its new pointer. Private tasks and authentication details are excluded rather than silently published. A paginated read reached the first visible welcome message at **2026-10-04 09:03 UTC**, then returned no older messages with `partial=false`. The read covered **7,189 unique visible messages (1,354 human messages), 294 pages**, through **2026-11-14 23:58 UTC**. User-request text was reviewed; a separate browser visual pass remains in progress. This does not include the full contents of every attached image/PDF, external linked chat, local desktop file or owning repository. Those remain evidence-reconciliation gates, not silently completed requests. Later corrections, including the request for detailed rather than few milestones, are incorporated.
