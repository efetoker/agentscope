# Claude Code Runtime Notes

## Root paths

- `~/.claude/`
- `~/.claude.json`

## High-signal artifacts

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/usage-data/`
- optional metadata from `~/.claude.json`, `~/.claude/history.jsonl`, and `~/.claude/usage-data/session-meta/*.json`

## Live adapter support

Live mode reads Claude Code project JSONL stores under `~/.claude/projects/**/*.jsonl`. A project JSONL file is treated as a session source, with linked subagent or sidechain files included when the adapter can connect them safely.

Malformed JSONL lines, including malformed JSONL entries inside project transcripts, produce runtime-scoped warnings when usable session data remains. A targeted Claude run with no readable session data follows the shared unavailable-runtime policy.

Set `AGENTSCOPE_FIXTURES_MODE=1` to use sanitized fixture/development data instead of live stores.

## Caveats

- Active Claude transcripts may live under `projects/` rather than a dedicated `sessions/` directory.
- `agentscope` keeps raw Claude payloads in bundle files instead of printing full transcript bodies to stdout.
- Optional metadata sources enrich diagnostics and discovery only when available; project JSONL files remain the primary source.

## Current support in this repo

- Live runtime detection through `doctor`
- Live and fixture-backed Claude search/grouping
- Whole-tree `show`/`export` bundle materialization with raw payloads kept in explicit local bundles
