# Codex Runtime Notes

## Root path

- `~/.codex`

## Key artifacts

- `~/.codex/session_index.jsonl`
- `~/.codex/sessions/**/rollout-*.jsonl`

## Caveats

- Rollout JSONL is the primary sequencing source for the current Codex adapter path.
- `agentscope` keeps raw Codex rollout detail inside bundles rather than printing full rollout bodies to stdout.

## Current support in this repo

- Cross-runtime search with Claude + Codex in fixture mode
- Exact and partial ID resolution with explicit ambiguity handling
- Whole-tree `show` and `export` bundle materialization for Codex trees
