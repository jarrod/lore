# Lore CLI Reference

The installed binary's machine-readable help is authoritative:

```text
lore --help
lore <command> --help
lore --version
```

Every knowledge command accepts `--bundle <path>`. Repository-local operation should also set `OKF_CACHE_DIR=<repo-root>/.lore/cache`.

## Commands

```text
lore init [--repo <path>]
lore info [--bundle <path>]
lore index [--rebuild] [--bundle <path>]
lore find <query> [--type <type>] [--tag <tag>] [--status <status>] [--scope <concept-id>] [--limit <1..100>] [--bundle <path>]
lore get <concept-id> [--section <heading>] [--bundle <path>]
lore graph <concept-id> [--direction <in|out|both>] [--depth <1..8>] [--rel <relationship>] [--to <concept-id>] [--bundle <path>]
lore put <concept-id> [--bundle <path>] < request.json
lore status <concept-id> <status> [--expected-hash <hash>] [--bundle <path>]
lore check [--strict] [--bundle <path>]
```

`find` uses a natural lexical query rather than raw FTS syntax. Type, tag, status, and scope are optional filters. An absent lifecycle status is unspecified and does not match an explicit status filter.

`get` returns the content hash, derived trust, full frontmatter, and original Markdown body. `--section` returns the exact matching Markdown heading span.

`graph` defaults to both directions and depth 1. Preserve edge origin in explanations: `markdown` denotes ordinary `links_to` references; `typed` denotes `x-okf.rel` metadata.

`status` performs a guarded top-level status merge without changing the body or other metadata. Use the hash returned by `get` with `--expected-hash` for existing content.

## Put Requests

`put` reads one JSON object from stdin:

```json
{
  "mode": "create | merge | replace",
  "frontmatter": {},
  "body": "# Inline Markdown",
  "body_file": "/path/to/body.md",
  "relations": [["relationship", "target/concept-id"]],
  "expected_hash": "hash-from-get",
  "allow_destructive": false
}
```

- `mode` defaults to `merge`.
- `create` rejects an existing concept.
- `merge` preserves omitted top-level metadata and body.
- `replace` requires complete content and `allow_destructive: true`.
- `body` and `body_file` are mutually exclusive.
- `relations` replaces the complete controlled `x-okf.rel` collection when supplied.
- Every resulting concept requires a non-empty, user-selected `type`.
- Unknown frontmatter is preserved semantically.

Relationship names match `[a-z][a-z0-9_]*`; targets are canonical concept IDs without `.md`.

## Protocol and Recovery

Success is compact JSON on stdout:

```json
{"ok":true,"data":{}}
```

Failure is compact JSON on stderr:

```json
{"ok":false,"error":{"code":"CONCEPT_NOT_FOUND","message":"Concept does not exist","details":{"id":"missing"}}}
```

`lore --version` is the only plain-text exception.

- `0`: success
- `2`: invalid command or arguments
- `3`: invalid knowledge or strict validation failure
- `4`: concept or bundle not found
- `5`: mutation conflict
- `6`: unsupported capability
- `10`: internal error

Do not retry argument, validation, capability, or internal errors blindly. On exit 5, reread the concept and reconcile against its new hash.
