# Swarm: SC-033 Bundled Release Prep (starmynd-cli v0.1.2)
> Created: 2026-04-20 | Status: ACTIVE | Repo: starmynd-cli

## Objective

Ship clean v0.1.2 public release bundling SC-028 Gate 5 scanner-skip fix on top of merged v0.1.1.

## Success Criteria

- [ ] Scanner skips collection-scope paths (GUIDE.md, governance/config.yaml, namespaces/_index.yaml)
- [ ] Unit tests validate skip + non-skip behavior
- [ ] npm test green
- [ ] package.json @ 0.1.2
- [ ] CHANGELOG 0.1.2 entry with SC-028 gate 5 reference
- [ ] README install instructions match fresh-operator path
- [ ] npm pack dry-run clean (no .env, node_modules, secrets)
- [ ] Branch pushed to origin
- [ ] PRE-PUBLISH-CHECKLIST.md written with "ready for merge"

## Wave Plan

| Wave | Name | Steps | Status |
|------|------|-------|--------|
| 1 | Bundled release prep | 9 sequential steps (commit per step) | IN PROGRESS |

## Step Registry

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | Read SC-028 report, identify 13 errors | pending | |
| 2 | Add scanner skip list + unit tests | pending | |
| 3 | npm test must pass | pending | n/a |
| 4 | Bump package.json 0.1.1 -> 0.1.2 | pending | |
| 5 | CHANGELOG 0.1.2 entry | pending | |
| 6 | README install sanity check | pending | |
| 7 | npm pack --dry-run hygiene | pending | |
| 8 | Push branch to origin | pending | n/a |
| 9 | Write PRE-PUBLISH-CHECKLIST.md | pending | |

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | No spawned sub-agents | Git isolation rule prevents agents from committing; brief requires one-commit-per-step; orchestrator owns git |
| 2 | Swarm folder inside starmynd-cli worktree (not life-os hub) | Per user clarification; orchestrator syncs to life-os hub post-exit |

## Learnings

TBD at close.
