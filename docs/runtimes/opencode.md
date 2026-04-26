# OpenCode Runtime Notes

## Root paths

- Config root: `~/.config/opencode`
- Data root: `~/.local/share/opencode`

## Primary history source

- `~/.local/share/opencode/opencode.db`

## Live adapter support

Live mode reads `~/.local/share/opencode/opencode.db` as a read-only SQLite store. The adapter uses the `project`, `session`, `message`, and `part` tables for project context, session linkage, message metadata, and content/tool payload surfaces.

Normal WAL/SHM live-read behavior is tolerated. Config and auth-adjacent files are diagnostics-only and are not read into search, show, or export payloads.

Set `AGENTSCOPE_FIXTURES_MODE=1` to use sanitized fixture/development data instead of live stores.

## Caveats

- Root/child linkage comes from session parent relationships in the database, not JSONL transcript files.
- `agentscope` keeps raw OpenCode detail inside bundle files rather than printing full DB-backed payloads to stdout.
- `tool-output/` completeness is a known limitation unless a future phase proves safe local-bundle inclusion.

## Current support in this repo

- Live and fixture-backed OpenCode search through the shared CLI contract
- Whole-tree `show` and `export` bundle materialization
- DB-aware `doctor` warnings and explicit repo/path confidence statuses
