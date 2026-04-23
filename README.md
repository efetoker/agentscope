# agentscope

CLI for searching, locating, reconstructing, and exporting local session data from CLI coding agents.

## Current status

Implemented today:

- Claude Code `search`, `show`, `export`, and `doctor`
- Codex `search`, `show`, and `export` through the shared multi-runtime path
- OpenCode `search`, `show`, `export`, and `doctor` through the shared multi-runtime path
- Whole-tree expansion for Claude, Codex, and OpenCode root/child session fixtures
- Manifest-backed temp/export bundles
- Shared bounded human output, structured JSON output, ambiguity handling, and truncation signaling

Planned next:

- contract lock-in and regression hardening
- release-focused docs polish

## Command summary

- `agentscope search <query>`
- `agentscope show <id>`
- `agentscope export <id> --out <dir>`
- `agentscope doctor`

## Non-goals

- no analytics/dashboard features
- no persistent indexing warehouse
- no queryless browse mode in MVP

## Runtime notes

- Claude Code: implemented
- Codex: implemented
- OpenCode: implemented

See [`docs/runtimes/README.md`](docs/runtimes/README.md) for the runtime notes index.
