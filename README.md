# Lore

[![CI](https://github.com/jarrod/lore/actions/workflows/test.yml/badge.svg)](https://github.com/jarrod/lore/actions/workflows/test.yml)
[![GitHub Release](https://img.shields.io/github/v/release/jarrod/lore)](https://github.com/jarrod/lore/releases/latest)
[![License](https://img.shields.io/github/license/jarrod/lore)](LICENSE)

Lore is a small, agent-native command-line runtime for [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundles.

OKF Markdown and YAML remain authoritative. Lore builds a disposable SQLite cache for FTS5/BM25 search, backlinks, typed graph relationships, traversal, and incremental indexing. It embeds no LLM, server, network service, or external database.

## Install and set up

From the repository where you want to use Lore, install its public skills with the [skills.sh installer](https://skills.sh/docs):

```bash
npx skills@latest add jarrod/lore --skill setup-lore --skill use-lore
```

Choose the coding agents you use, such as Codex or Claude Code. The skill installer currently requires Node.js 22.20 or newer and npm; Lore itself runs as a standalone executable.

Then ask your agent:

> Use setup-lore to install Lore in this repository.

The agent selects the correct release for your operating system, verifies its checksum, and runs Lore's built-in setup. Existing knowledge is preserved. To upgrade later, ask setup-lore to upgrade Lore.

Once installed, ask:

> Use use-lore to inspect my knowledge bundle.

Or:

> Use use-lore to store this decision and relate it to the existing project knowledge.

`use-lore` handles storage and retrieval. You or your own knowledge-worker skill choose how content is extracted, written, and organized.

### Manual installation

Download the executable for your platform and `SHA256SUMS` from [GitHub Releases](https://github.com/jarrod/lore/releases/latest). Verify the executable's SHA-256 checksum, give it execute permission on macOS/Linux, and run it from your repository:

```bash
/path/to/downloaded/lore init
./.lore/bin/lore info
```

On Windows, use the `lore-windows-x64.exe` asset and `.lore\bin\lore.exe`. Supported platforms are macOS ARM64/x64, Linux ARM64/x64, and Windows x64. Releases are currently unsigned and not notarised.

The local-first defaults described below require the forthcoming release containing this change. The published `v0.1.0` binary requires `--bundle .lore/knowledge`; setup checks the installed version's help before verification.

## Commands

```text
lore --help
lore --version
lore <command> --help
lore init [--repo PATH]
lore info
lore index [--rebuild]
lore find <query> [--type T] [--tag T] [--status S] [--scope ID] [--limit N]
lore get <concept-id> [--section HEADING]
lore graph <concept-id> [--direction in|out|both] [--depth 1..8] [--rel R] [--to ID]
lore visualise [<concept-id>] [--direction in|out|both] [--depth 1..8] [--rel R] [--max-nodes 1..1000] [--output PATH] [--open]
lore put <concept-id> < request.json
lore status <concept-id> <status> [--expected-hash HASH]
lore reset --knowledge [--bundle PATH] [--no-backup] [--confirm TOKEN]
lore check [--strict]
```

Help is returned as a successful, machine-readable JSON response and does not require a resolvable bundle. `lore --version` is the sole plain-text exception and prints only the version number. Lore refuses every command unless it is running as a compiled standalone executable; invoking the TypeScript source returns an unsupported-capability error.

Every knowledge command defaults to `.lore/knowledge` beside the installed executable, even when called from another working directory. A binary outside `.lore/bin` uses `.lore/knowledge` in the current directory. Lore never searches parent directories or treats the source repository itself as a knowledge bundle.

Use `--bundle PATH` to select another bundle. Caches are stored outside the bundle: standard local knowledge uses `.lore/cache`; other bundles use a sibling `.lore/cache` directory, with a separate hashed index for each bundle.

Success is compact JSON on stdout:

```json
{ "ok": true, "data": {} }
```

Failures are compact JSON on stderr:

```json
{
  "ok": false,
  "error": {
    "code": "CONCEPT_NOT_FOUND",
    "message": "Concept does not exist",
    "details": { "id": "missing-concept" }
  }
}
```

Exit codes are `0` success, `2` invalid arguments, `3` invalid OKF, `4` not found, `5` mutation conflict, `6` unsupported capability, and `10` internal error. Validation warnings exit successfully unless `check --strict` is used.

## Typed relationships

Normal Markdown links become `links_to` graph edges. Internal concept paths in standard OKF `resource`, `sources[].resource`, `computation`, `executor.resource`, and `attester.resource` fields become graph edges with `origin: okf`. Optional typed relationships use the conformant extension:

```yaml
x-okf:
  rel:
    - [related_to, another-concept]
    - [derived_from, source-material]
```

Targets are canonical concept IDs. Relationship names match `[a-z][a-z0-9_]*`.

## Visualisation

`visualise` generates a disposable, self-contained HTML graph without a server, network request, Graphviz, or browser-side dependency. Omit the concept ID for the complete bundle, or provide one to visualise a neighbourhood using the same direction, depth, and relationship semantics as `graph`:

```bash
lore visualise
lore visualise knowledge/example --direction both --depth 2 --open
lore visualise --rel related_to --output .lore/visualisations/related.html
```

The command returns the absolute output path and graph counts as compact JSON. It refuses graphs above 500 nodes by default instead of producing a misleading partial view; use `--max-nodes` to explicitly raise the limit up to 1000. Generated files belong outside the authoritative bundle and are ignored under `.lore/visualisations/`.

## Knowledge structure

Lore requires a non-empty concept `type`, but does not prescribe a type vocabulary, folder hierarchy, body template, or relationship ontology. Unknown YAML frontmatter is preserved. OKF lifecycle values are `draft`, `stable`, and `deprecated`; an absent status has the effective value `stable`. Absent verification is reported as `unverified`.

`index.md` and `log.md` remain recognised as optional reserved OKF files for compatibility with existing portable bundles. Lore excludes them from concepts, search, and graph indexing. New repository-local bundles and reset bundles are empty; Lore does not create either reserved file automatically.

Bundles may store an evolving ontology as ordinary concepts. That ontology remains user-owned and advisory: Lore does not reject otherwise valid knowledge merely because it is not classified by the ontology.

## Mutation

`put` is the content mutation command. It accepts `create`, `merge`, and guarded `replace` requests:

```json
{
  "mode": "merge",
  "frontmatter": { "type": "Concept", "title": "Example" },
  "body_file": "/tmp/example.md",
  "relations": [["related_to", "another-concept"]],
  "expected_hash": "optional-hash-from-get"
}
```

Use either `body` or `body_file`. Merge preserves omitted frontmatter, unknown extensions, provenance, verification, generated metadata, and the existing body. Replace requires `allow_destructive: true`. Writes are validated and atomic; Lore does not rewrite `index.md` or `log.md`.

A successful mutation reports `index.current`. When false, the authoritative Markdown write committed successfully but the disposable cache could not refresh; run the reported recovery command after correcting any invalid bundle content.

For a lifecycle-only change, use the dedicated deterministic command with the current hash returned by `get`:

```bash
lore status knowledge/example stable --expected-hash HASH
```

The command accepts the OKF lifecycle values `draft`, `stable`, and `deprecated`, and preserves the concept body and all other frontmatter. Store user-defined workflow states in a namespaced extension instead of overloading the standard `status` field.

## Reset knowledge

`reset --knowledge` clears the complete authoritative bundle while preserving the installed Lore executable. Reset is recoverable and requires a state-derived confirmation token. First preview the exact bundle that would be reset:

```bash
lore reset --knowledge
```

The successful JSON response reports the canonical bundle path, concept and file counts, byte count, and `confirmation_token`. The preview does not modify any files. To perform the reset, pass that token back unchanged:

```bash
lore reset --knowledge --confirm TOKEN
```

Lore rejects a stale or incorrect token with exit code 5. A confirmed reset moves the complete previous bundle to `.lore/backups/knowledge-<timestamp>-<token-prefix>`, creates a fresh empty bundle, and deletes and rebuilds the derived SQLite database, including its WAL and SHM files. The response reports the backup path and removed counts. Repository-local `init` configuration ignores `.lore/backups/` so recoverable copies are not committed accidentally.

To permanently reset without retaining a backup, include `--no-backup` in both the preview and confirmed commands:

```bash
lore reset --knowledge --no-backup
lore reset --knowledge --no-backup --confirm TOKEN
```

The confirmation token is bound to the selected reset mode. A token from a recoverable preview cannot authorize `--no-backup`, and vice versa. The permanent response reports `mode: "permanent"` and `recoverable: false`; the removed knowledge cannot be restored by Lore.

Resetting is a destructive operation even though Lore creates a backup. Inspect the canonical bundle and counts from the preview before confirming it. Delete the backup manually only after the new empty bundle has been verified.

## Development

Requires Bun 1.4.0 for development only:

```bash
bun install --frozen-lockfile
bun run check
```

`bun run build` produces a standalone `dist/lore` executable containing Bun and SQLite. End users do not need Bun, Node, npm, or SQLite installed.

To build Lore and initialize this checkout with that compiled executable:

```bash
bun run dev:setup
```

To initialize another development repository, pass the normal `init` option through the package command:

```bash
bun run dev:setup -- --repo /path/to/repository
```

## Agent integration

The operational [`use-lore`](skills/use-lore) skill teaches a skill-capable agent how to invoke Lore, interpret its protocol, and mutate bundles safely. It deliberately contains no knowledge-extraction, taxonomy, document-structure, or writing policy.

Consumers should provide their own knowledge-worker skill or workflow when they need decisions about source analysis, concept boundaries, classification, organization, prose, citations, or relationship vocabulary. That consumer policy calls `use-lore`, which calls the deterministic binary:

```text
consumer knowledge-worker policy -> use-lore -> Lore binary -> portable OKF bundle
```

Install `setup-lore` and `use-lore` using the skills.sh command at the top of this page. Setup installs the binary and creates:

```text
<repository>/.lore/
├── bin/lore          # lore.exe on Windows
├── cache/            # disposable SQLite state
├── knowledge/        # authoritative OKF Markdown
├── backups/          # recoverable resets, created on demand
├── visualisations/   # generated graphs, created on demand
└── .gitignore        # ignores generated files, preserves knowledge
```

Use `./.lore/bin/lore info` from the repository root, or call the installed executable by its absolute path from elsewhere.

## Contributing and support

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Use [GitHub Issues](https://github.com/jarrod/lore/issues) for reproducible defects and scoped feature requests, and [GitHub Discussions](https://github.com/jarrod/lore/discussions) for usage questions or broader design conversation. Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Releases

Pull requests and pushes to `main` run the dependency audit, tests, type checking, native build, and compiled smoke-test workflow. They do not publish releases.

To publish the version declared in `package.json`, create and push the matching tag from a commit contained in `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds and smoke-tests Linux x64/ARM64, macOS Intel/ARM64, and Windows x64 binaries on matching GitHub-hosted runners. It publishes those five binaries and `SHA256SUMS` to the resulting GitHub Release.

## License

Lore is licensed under the [Apache License 2.0](LICENSE).
