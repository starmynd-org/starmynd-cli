# Swarm: SC-033 Bundled Release Prep (starmynd-cli v0.1.2)
> Created: 2026-04-20 | Status: COMPLETE | Repo: starmynd-cli

## Objective

Ship clean v0.1.2 public release bundling SC-028 Gate 5 scanner-skip fix on top of merged v0.1.1.

## Success Criteria

- [x] Scanner skips collection-scope paths (GUIDE.md, config.yaml, governance/config.yaml, namespaces/_index.yaml)
- [x] Unit tests validate skip + non-skip behavior (8/8 pass)
- [x] npm test green
- [x] package.json @ 0.1.2
- [x] CHANGELOG 0.1.2 entry with SC-028 gate 5 reference
- [ ] README install instructions match fresh-operator path (no README exists; flagged in PRE-PUBLISH-CHECKLIST)
- [x] npm pack dry-run clean (no .env, node_modules, secrets)
- [x] Branch pushed to origin
- [x] PRE-PUBLISH-CHECKLIST.md written with "ready for merge"

## Wave Plan

| Wave | Name | Steps | Status |
|------|------|-------|--------|
| 1 | Bundled release prep | 9 sequential steps (commit per step) | COMPLETE |

## Step Registry

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | Read SC-028 report, identify 13 errors | complete | `4d4b703` |
| 2 | Add scanner skip list + unit tests | complete | `e454b48` (+ `d89656e` test-script glob fix) |
| 3 | npm test must pass | complete | n/a (8/8 green) |
| 4 | Bump package.json 0.1.1 -> 0.1.2 | complete | `54b526e` |
| 5 | CHANGELOG 0.1.2 entry | complete | `e1a95f6` |
| 6 | README install sanity check | no-drift (no README exists) | n/a (flagged in PRE-PUBLISH-CHECKLIST) |
| 7 | npm pack --dry-run hygiene | complete | `3f2f801` (added CHANGELOG.md to files allowlist) |
| 8 | Push branch to origin | complete | n/a (branch at `3f2f801`) |
| 9 | Write PRE-PUBLISH-CHECKLIST.md | complete | (this commit) |

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | No spawned sub-agents | Git isolation rule prevents agents from committing; brief requires one-commit-per-step; orchestrator owns git |
| 2 | Swarm folder inside starmynd-cli worktree (not life-os hub) | Per user clarification; orchestrator syncs to life-os hub post-exit |
| 3 | Node built-in `node:test` for tests | Zero new deps (alternatives: tsx, vitest). Leverages existing `@types/node@20`. |
| 4 | Skip list at `scanDirectory` (shared layer), not per-caller | Collection-scope files should never be scanned under any path; centralized list is lowest-surface + easiest to extend |
| 5 | `files: ["dist", "CHANGELOG.md"]` in package.json | Previous config had no files field (would have shipped full repo on publish) |
| 6 | README gap flagged, not filled | Smallest-surface judgment call: creating a README from scratch is content work, not drift-fixing (brief scoped to "scanner-skip + release metadata"). Surfaced in PRE-PUBLISH-CHECKLIST. |

## Learnings

1. Fresh worktrees do not inherit `node_modules/` (gitignored). `npm install` is a required precondition for any step that shells out to `tsc` or `npm test` in a newly-created worktree. Mentally model this as "worktree setup" before step 2.
2. Node 24's `--test <dir>` did not auto-discover `*.test.js` files the way prior releases did; it treated the directory as a single test and ran `index.js`. Use Node's internal glob via `"dist-test/**/*.test.js"` for stable discovery.
3. Default npm pack (no `files` field, gitignored `dist/`) ships an empty tarball for CLI packages whose `bin` points inside `dist/`. This is a latent publish-blocker easy to miss without a dry-run; add the dry-run to every CLI pre-release checklist.
4. SC-028 Gate 5's "13 errors" was a mix of one schema-drift error (requiring API/CLI type reconciliation, deferred to SC-031) and 12 scanner-skip errors. The scanner-skip errors were fixed here; the schema-drift one was left in place, which is the correct scope decision.
