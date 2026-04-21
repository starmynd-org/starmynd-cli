# SC-033 Pre-Publish Checklist

> Swarm: sc033-bundled-release | Target: @starmynd/cli v0.1.2 | Date: 2026-04-20
> Branch: `swarm/sc033-bundled-release` at `3f2f801` (6 commits ahead of master `29d1523`)
> Worktree: `/home/andlwarn/repos/worktrees/sc033-bundled-release`

## Gate checks

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Tests green | PASS | `npm test` 8/8 pass (2 suites, files.test.ts covers skip list contents + skip behavior + non-skip at same-named nested paths + non-masking of schema-invalid files at non-skipped paths) |
| 2 | Version bumped to 0.1.2 | PASS | `package.json` line 3 at `0.1.2`; `package-lock.json` mirrors. Commit `54b526e`. |
| 3 | CHANGELOG has 0.1.2 entry | PASS | `CHANGELOG.md` top entry `[0.1.2] - 2026-04-20`, references SC-028 gate 5. Commit `e1a95f6`. |
| 4 | npm pack --dry-run clean | PASS | 54 files, 39.3 kB tarball. All content under `dist/` + `CHANGELOG.md` + `package.json`. No `.env`, no `node_modules`, no `src/`, no tests, no secrets, no swarm artifacts. |
| 5 | Branch pushed to origin | PASS | `origin/swarm/sc033-bundled-release` at `3f2f801`. PR URL surfaced by GitHub on push. |

## Commits (oldest -> newest)

1. `4d4b703` swarm(sc033): step 1 scope + 13-error audit from SC-028 Gate 5
2. `e454b48` fix(validate): skip collection-scope paths in scanner (SC-028 gate 5)
3. `d89656e` fix(test): target test files via glob in npm test script
4. `54b526e` chore(release): bump version to 0.1.2
5. `e1a95f6` docs(changelog): add 0.1.2 entry (SC-028 gate 5 scanner-skip)
6. `3f2f801` chore(release): include CHANGELOG.md in npm package

## Scope adherence

- Scanner skip fix: `src/lib/files.ts` `COLLECTION_SKIP_PATHS` + tests. Covers 12 of 13 SC-028 gate 5 errors.
- Release metadata: version bump, CHANGELOG entry, `files` allowlist (prevented full-repo leak), CHANGELOG in tarball.
- No scope creep: no auth logic touched, no npm publish run, no merge attempted.

## Deferred / out of scope

- The 13th gate 5 error (`agent/team-lead components[1].component_type` enum drift between API and CLI schemas) is not scanner-skip-fixable. Deferred to **SC-031 CLI Validator Hygiene**, which will extract a shared `@starmynd/schema` package consumed by both CLI and API. Called out in the CHANGELOG `### Notes` block.
- `README.md` does not exist in the repo. Brief step 6 asked to sanity-check README install instructions; there is no README to check. Flagged here rather than created in-swarm because writing a README from scratch is content work, not drift-fixing (brief scope was "scanner-skip + release metadata"). Recommendation: small follow-up to draft a minimal README with install + commands reference before the first npm publish.

## Pre-publish judgment calls made during this swarm

1. **Test framework (none existed).** Chose Node's built-in `node:test` runner. Zero new deps (leveraged existing `@types/node@20`). Tests compile via a separate `tsconfig.test.json` to `dist-test/` (gitignored, npm-ignored).
2. **Package files allowlist.** Added `"files": ["dist", "CHANGELOG.md"]` to `package.json`. Previous config had no `files` field, meaning an `npm publish` today would have shipped the entire repo (including `src/`, `swarms/`, node internals) and a gitignored `dist/` would have left the `bin` reference broken. Both are now fixed.
3. **Scanner skip location.** Put the skip list at `scanDirectory` (the shared layer) rather than in each caller. Applies to validate, sync, and kb callers. These structural files should never be pushed or validated as entities under any path, so a centralized list is the lowest-surface fix and easiest to extend.
4. **Match semantics.** Skip is anchored to the scan-root-relative path, not basename. A legitimate `knowledge/GUIDE.md` at a non-skipped relative path is still scanned. Covered by test `does not skip same-named files at non-skipped relative paths`.
5. **Node 24 test discovery quirk.** `node --test dist-test/` did not auto-discover `*.test.js` files in Node 24 the way earlier releases did; it treated the directory as a single test and ran `index.js`. Fixed by passing `"dist-test/**/*.test.js"` so Node's internal glob resolver handles the match.

## Operator follow-up (post-merge)

- [ ] Sync this swarm folder to life-os hub at `Repos/swarms/swarms/completed/2026-04-20-sc033-bundled-release/` (orchestrator).
- [ ] Merge `swarm/sc033-bundled-release` into `master` (orchestrator; do not let the swarm do this).
- [ ] Decide on README content before first `npm publish`. Minimal acceptable: project description, install via `npm install -g @starmynd/cli`, and a pointer to the subcommand list from `starmynd --help`.
- [ ] Confirm Andrew is gating `npm publish`. Publish command intentionally not run in this swarm per brief.

---

ready for merge
