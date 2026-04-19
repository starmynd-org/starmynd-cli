# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-04-19

### Fixed
- `kb list --namespace <slug>` now returns actual nodes by calling the `/api/knowledge/namespaces/[id]/nodes` endpoint with pagination. Previously returned empty due to a schema mismatch (filtered the wrong table). (SC-027)
- `init <slug>` now materializes the full workspace in a single command: writes `.starmynd/config.yaml`, `GUIDE.md`, and all entity folders (`agents/`, `workflows/`, `knowledges/`, `skills/`, `namespaces/`, `governance/`). Previously only wrote the config. (SC-027)
- Improved error messages in `kb list`: distinct red message for "namespace not found" and yellow message for "namespace has 0 nodes". Hint text now references the correct `starmynd list knowledge` subcommand.

### Added
- `init --force` flag to overwrite an existing `.starmynd/` directory.
- `init` now fails fast with a clear "Run starmynd auth login first" message when authentication is missing, instead of silently writing a partial config.

## [0.1.0] - 2026-04-16

Initial release of the StarMynd CLI. (SC-026)

### Added
- `starmynd auth login` and `auth logout` commands with OAuth flow.
- `starmynd init <slug>` to scaffold a local workspace config.
- `starmynd kb list --namespace <slug>` to list knowledge base nodes.
- `starmynd kb push` and `kb pull` for syncing local and remote knowledge.
- `starmynd list knowledge` to enumerate available namespaces.
- `starmynd --version` version flag.
- Constellation welcome screen on first run.
