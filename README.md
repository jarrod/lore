# Lore

Lore is a small, agent-native command-line runtime for [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundles.

OKF Markdown and YAML remain authoritative. Lore builds a disposable SQLite cache for FTS5/BM25 search, backlinks, typed graph relationships, traversal, and incremental indexing. It embeds no LLM, server, network service, or external database.

The complete design is in [technical-brief.md](technical-brief.md).

## Commands

```text
lore --help
lore <command> --help
lore info
lore index [--rebuild]
lore find <query> [--type T] [--tag T] [--status S] [--scope ID] [--limit N]
lore get <concept-id> [--section HEADING]
lore graph <concept-id> [--direction in|out|both] [--depth 1..8] [--rel R] [--to ID]
lore put <concept-id> < request.json
lore check [--strict]
```

Help is returned as a successful, machine-readable JSON response and does not require a resolvable bundle.

Every command operates on one bundle. Resolution order is `--bundle`, `OKF_BUNDLE`, then the current directory. Lore never walks parent directories.

Success is compact JSON on stdout:

```json
{"ok":true,"data":{}}
```

Failures are compact JSON on stderr:

```json
{"ok":false,"error":{"code":"CONCEPT_NOT_FOUND","message":"Concept does not exist","details":{"id":"systems/missing"}}}
```

Exit codes are `0` success, `2` invalid arguments, `3` invalid OKF, `4` not found, `5` mutation conflict, `6` unsupported capability, and `10` internal error. Validation warnings exit successfully unless `check --strict` is used.

## Typed relationships

Normal Markdown links become `links_to` graph edges. Optional typed relationships use the conformant extension:

```yaml
x-okf:
  rel:
    - [implements, capabilities/customer-identity]
    - [owned_by, teams/identity]
```

Targets are canonical concept IDs. Relationship names match `[a-z][a-z0-9_]*`.

## Mutation

`put` is the only mutation command. It accepts `create`, `merge`, and guarded `replace` requests:

```json
{
  "mode": "merge",
  "frontmatter": {"type": "System", "title": "Okta"},
  "body_file": "/tmp/okta.md",
  "relations": [["implements", "capabilities/customer-identity"]],
  "expected_hash": "optional-hash-from-get"
}
```

Use either `body` or `body_file`. Merge preserves omitted frontmatter, unknown extensions, provenance, verification, generated metadata, and the existing body. Replace requires `allow_destructive: true`. Writes are validated and atomic; Lore does not rewrite `index.md` or `log.md`.

## Development

Requires Bun 1.3.14 for development only:

```bash
bun install --frozen-lockfile
bun run check
```

`bun run build` produces a standalone `dist/lore` executable containing Bun and SQLite. End users do not need Bun, Node, npm, or SQLite installed.

## Agent skill

The canonical agent skill is versioned at [`skills/use-lore`](skills/use-lore). It teaches a skill-capable agent how to turn natural-language questions into focused Lore searches, retrieval, graph traversal, validation, and guarded mutations without duplicating Lore's deterministic behavior.

Install the whole `skills/use-lore` directory into the target agent's skill search path, either by copying it or linking back to this checkout. For example:

```bash
cp -R skills/use-lore /path/to/agent/skills/use-lore
```

The skill and executable are separate deliverables. The target agent must also have the `lore` executable on `PATH`; a development agent working in this checkout can use `bun run src/cli.ts` instead.

## Releases

Pull requests and pushes to `main` run the test, type-check, native-build, and compiled smoke-test workflow. They do not publish releases.

To publish the version declared in `package.json`, create and push the matching tag from a commit contained in `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds and smoke-tests Linux x64/ARM64, macOS Intel/ARM64, and Windows x64 binaries on matching GitHub-hosted runners. It publishes those five binaries and `SHA256SUMS` to the resulting GitHub Release.
