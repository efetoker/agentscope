# OpenCode Runtime Notes

## Root paths

- Config root: `~/.config/opencode`
- Data root: `~/.local/share/opencode`

## Primary history source

- `opencode.db`

## Caveats

- Root/child linkage comes from session parent relationships in the database, not JSONL transcript files.
- `agentscope` keeps raw OpenCode detail inside bundle files rather than printing full DB-backed payloads to stdout.

## Current support in this repo

- Fixture-backed OpenCode search through the shared CLI contract
- Whole-tree `show` and `export` bundle materialization
- DB-aware `doctor` warnings and explicit repo/path confidence statuses
