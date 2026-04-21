---
id: SC-033
name: bundled-release
type: build-ship
created: 2026-04-20
status: active
branch: swarm/sc033-bundled-release
worktree: /home/andlwarn/repos/worktrees/sc033-bundled-release
base_commit: 29d1523
token_budget_soft: 70000
token_budget_hard: 90000
wall_clock_hard_min: 40
---

# SC-033 Bundled Release Prep (starmynd-cli v0.1.2)

## Goal

Ship a clean v0.1.2 public release with the SC-028 Gate 5 scanner-skip fix bundled in. `@starmynd/cli` has NOT yet been published to npm; this release adds the scanner-skip fix on top of merged v0.1.1 (SC-027) so there's a clean semver delta for the first public publish.

## Context

- starmynd-cli master at `29d1523` with v0.1.1 merged (SC-027 kb list + init auto-materialize fixes).
- SC-028 Gate 5 cold-start simulation caught 13 validator errors on `starmynd init` + `starmynd validate .starmynd/`: 1 parse error on auto-generated `GUIDE.md` + 12 schema errors on collection-index yamls (`governance/config.yaml`, `namespaces/_index.yaml`).
- SC-028 report: `Repos/worktrees/sc028-dominic-simulation/Repos/swarms/swarms/completed/2026-04-20-sc028-dominic-simulation-test/DOMINIC-TEST-REPORT.md` (on unmerged sc028 branch).

## Success criteria

- Scanner skip list covers `GUIDE.md`, `governance/config.yaml`, `namespaces/_index.yaml`, and any other collection-scope paths surfaced by the SC-028 report.
- Unit tests prove: skip list skips those paths; real schema violations on entity files still error.
- `npm test` green. Zero unrelated fixes.
- `package.json` at `0.1.2`.
- `CHANGELOG.md` has 0.1.2 entry referencing SC-028 gate 5.
- README install instructions match the fresh-operator path.
- `npm pack --dry-run` output has no `.env`, no `node_modules`, no secrets.
- Branch `swarm/sc033-bundled-release` pushed to origin.
- `PRE-PUBLISH-CHECKLIST.md` reports "ready for merge".

## Hard rules

- One commit per step, clear messages, no em dashes.
- Do NOT run `npm publish` (Andrew-gated).
- Do NOT merge to master (orchestrator will).
- Do NOT rotate auth logic.
- Do NOT expand scope beyond scanner-skip + release metadata.
- Unrelated test failures -> STOP and report.
- Rule 21/22: budget breach -> checkpoint + clean exit.

## Execution shape

Single-lane sequential (Rule 20: strict linear dependencies, micro-parallel N/A). Orchestrator runs all 9 steps directly; no spawned sub-agents (per git-isolation rule, spawned agents cannot commit; this swarm requires one-commit-per-step).
