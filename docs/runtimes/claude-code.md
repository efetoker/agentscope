# Claude Code Runtime Notes

## Root paths

- `~/.claude/`
- `~/.claude.json`

## High-signal artifacts

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/usage-data/`

## Caveats

- Active Claude transcripts may live under `projects/` rather than a dedicated `sessions/` directory.
- `agentscope` keeps raw Claude payloads in bundle files instead of printing full transcript bodies to stdout.

## Current support in this repo

- Baseline runtime detection through `doctor`
- Fixture-backed Claude search/grouping
- Whole-tree `show`/`export` bundle materialization for the Claude MVP path
