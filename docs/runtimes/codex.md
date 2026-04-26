# Codex Runtime Notes

## Root path

- `~/.codex`

## Key artifacts

- `~/.codex/session_index.jsonl`
- `~/.codex/sessions/**/rollout-*.jsonl`
- optional `~/.codex/history.jsonl` as lossy discovery context when useful

## Live adapter support

Live mode merges `~/.codex/session_index.jsonl` entries that include rollout paths with recursive discovery under `~/.codex/sessions/**`. Some observed `session_index.jsonl` layouts contain only thread metadata (`id`, `thread_name`, `updated_at`) and no rollout path; in that case live mode falls back to recursive rollout discovery and `doctor` reports `codex_index_unusable`.

Codex local storage is observed runtime behavior, not a stable public API, so support stays conservative where durable metadata is absent.

Parent/root linkage may be conservative when records do not expose durable relationship metadata. In those cases, `agentscope` prefers a safer single-session tree with runtime-scoped warnings over aggressive inferred grouping.

Set `AGENTSCOPE_FIXTURES_MODE=1` to use sanitized fixture/development data instead of live stores.

## Caveats

- Rollout JSONL is the primary sequencing source for the current Codex adapter path.
- `agentscope` keeps raw Codex rollout detail inside bundles rather than printing full rollout bodies to stdout.
- `history.jsonl` is optional and lossy; it is not authoritative for tree or export structure.
- `archived_sessions/*.jsonl` is fallback/future posture unless current implementation explicitly supports it.
- Sensitive files such as `auth.json`, `shell_snapshots/*.sh`, and `.codex-global-state.json` stay out of read/export scope except existence-only diagnostics when needed.

## Current support in this repo

- Cross-runtime search with Claude + Codex in live and fixture modes
- Exact and partial ID resolution with explicit ambiguity handling
- Whole-tree `show` and `export` bundle materialization for Codex trees
