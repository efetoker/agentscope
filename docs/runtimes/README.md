# Runtime Notes

Runtime notes cover live adapter behavior, fixture-mode development paths, known limitations, and safety guidance.

- [Claude Code](./claude-code.md) — live project JSONL stores plus fixture-mode coverage
- [Codex](./codex.md) — live index and rollout JSONL stores plus conservative linkage notes
- [OpenCode](./opencode.md) — live SQLite store support plus DB-aware doctor coverage

Each listed runtime has:

- runtime notes under `docs/runtimes/`
- live-mode adapter coverage through shared CLI or runtime tests
- fixture-mode coverage for development and regression tests
- known limitation and safety notes

Use `AGENTSCOPE_FIXTURES_MODE=1` to opt into sanitized fixture/development data. Without that environment variable, `agentscope` uses live runtime discovery by default.
