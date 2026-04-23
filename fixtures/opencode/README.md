# OpenCode Fixture DB

This SQLite fixture is the deterministic source of truth for the OpenCode runtime tests.

## Schema

- `sessions` — root/child linkage plus repo/path/timestamp metadata
- `events` — searchable runtime surfaces such as message, metadata, and error text

## Determinism rules

- Session ids, timestamps, repo paths, and path hints are fixed and human-readable.
- The fixture is small on purpose: one root session and one child session.
- If the fixture changes, update the runtime tests in the same commit so the DB shape and expectations stay aligned.

## Intended coverage

- whole-tree expansion from `oc-child-1`
- DB-backed search for `proxy`
- detect/export tests that use an explicit fixture DB path instead of the live install
