# Lore

Lore is a small, agent-native command-line runtime for [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundles.

OKF Markdown and YAML remain authoritative. Lore builds a disposable SQLite cache for FTS5/BM25 search, backlinks, typed graph relationships, traversal, and incremental indexing. It embeds no LLM, server, network service, or external database.

## Install

Download the standalone executable from the [latest GitHub Release](https://github.com/jarrod/lore/releases/latest). Lore includes its runtime and SQLite, so Bun, Node.js, npm, and a separate SQLite installation are not required.

Choose the asset for your system:

| System | Architecture | Asset |
| --- | --- | --- |
| macOS | Apple Silicon (`arm64`) | `lore-darwin-arm64` |
| macOS | Intel (`x86_64`) | `lore-darwin-x64` |
| Linux | Intel/AMD 64-bit (`x86_64`) | `lore-linux-x64` |
| Linux | ARM 64-bit (`aarch64` or `arm64`) | `lore-linux-arm64` |
| Windows | Intel/AMD 64-bit | `lore-windows-x64.exe` |

You can check a macOS or Linux machine with `uname -m`.

### macOS

Run these commands in Terminal. The example selects Apple Silicon; change `LORE_ASSET` to `lore-darwin-x64` on an Intel Mac.

```bash
LORE_ASSET=lore-darwin-arm64
LORE_BASE_URL=https://github.com/jarrod/lore/releases/latest/download
LORE_REPO=/path/to/repository

curl -fLO "$LORE_BASE_URL/$LORE_ASSET"
curl -fLO "$LORE_BASE_URL/SHA256SUMS"
grep "  ${LORE_ASSET}$" SHA256SUMS | shasum -a 256 -c -

chmod +x "$LORE_ASSET"
"./$LORE_ASSET" init --repo "$LORE_REPO"
"$LORE_REPO/.lore/bin/lore" --help
```

The checksum command must report `OK`. Early Lore releases are not code-signed or notarised. If macOS blocks the verified executable, open **System Settings → Privacy & Security** and choose **Open Anyway** for Lore.

### Linux

Run these commands in a shell. The example selects Intel/AMD x64; change `LORE_ASSET` to `lore-linux-arm64` on an ARM64 machine.

```bash
LORE_ASSET=lore-linux-x64
LORE_BASE_URL=https://github.com/jarrod/lore/releases/latest/download
LORE_REPO=/path/to/repository

curl -fLO "$LORE_BASE_URL/$LORE_ASSET"
curl -fLO "$LORE_BASE_URL/SHA256SUMS"
grep "  ${LORE_ASSET}$" SHA256SUMS | sha256sum -c -

chmod +x "$LORE_ASSET"
"./$LORE_ASSET" init --repo "$LORE_REPO"
"$LORE_REPO/.lore/bin/lore" --help
```

The checksum command must report `OK`.

### Windows

Run these commands in PowerShell:

```powershell
$asset = "lore-windows-x64.exe"
$baseUrl = "https://github.com/jarrod/lore/releases/latest/download"
$repo = "C:\path\to\repository"

Invoke-WebRequest "$baseUrl/$asset" -OutFile $asset
Invoke-WebRequest "$baseUrl/SHA256SUMS" -OutFile "SHA256SUMS"

$checksumLine = Get-Content "SHA256SUMS" | Where-Object { $_.EndsWith("  $asset") }
if (-not $checksumLine) { throw "Checksum for $asset was not found" }
$expected = ($checksumLine -split "\s+")[0]
$actual = (Get-FileHash $asset -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw "Lore checksum verification failed" }

& ".\$asset" init --repo $repo
& "$repo\.lore\bin\lore.exe" --help
```

The hash comparison produces no output when it succeeds; a mismatch stops installation. Early Lore releases are not code-signed. If Windows blocks the verified executable, run `Unblock-File ".\$asset"` before initialization.

`lore init` installs the executable into the selected repository and creates `.lore/knowledge`, `.lore/cache`, and `.lore/.gitignore`. It also configures `.lore/visualisations` as ignored derived output. It preserves existing knowledge and is safe to repeat. For a repeatable version-pinned installation, replace `releases/latest/download` with `releases/download/v0.1.0`, using the required release tag. To upgrade Lore, download the newer executable and run `init` against the repository again.

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
lore visualise [<concept-id>] [--direction in|out|both] [--depth 1..8] [--rel R] [--max-nodes 1..5000] [--output PATH] [--open]
lore put <concept-id> < request.json
lore status <concept-id> <status> [--expected-hash HASH]
lore check [--strict]
```

Help is returned as a successful, machine-readable JSON response and does not require a resolvable bundle. `lore --version` is the sole plain-text exception and prints only the version number. Lore refuses every command unless it is running as a compiled standalone executable; invoking the TypeScript source returns an unsupported-capability error.

Every knowledge command operates on one bundle. Resolution order is `--bundle`, `OKF_BUNDLE`, then the current directory. Lore never walks parent directories.

`OKF_BUNDLE` is optional. It is only a shortcut for selecting a bundle without repeating `--bundle`; it does not control where Lore stores knowledge. For ordinary software repositories, do not use the repository root as the bundle because unrelated Markdown files such as `README.md` are not OKF concepts.

Success is compact JSON on stdout:

```json
{"ok":true,"data":{}}
```

Failures are compact JSON on stderr:

```json
{"ok":false,"error":{"code":"CONCEPT_NOT_FOUND","message":"Concept does not exist","details":{"id":"missing-concept"}}}
```

Exit codes are `0` success, `2` invalid arguments, `3` invalid OKF, `4` not found, `5` mutation conflict, `6` unsupported capability, and `10` internal error. Validation warnings exit successfully unless `check --strict` is used.

## Typed relationships

Normal Markdown links become `links_to` graph edges. Optional typed relationships use the conformant extension:

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

The command returns the absolute output path and graph counts as compact JSON. It refuses graphs above 500 nodes by default instead of producing a misleading partial view; use `--max-nodes` to explicitly raise the limit up to 5000. Generated files belong outside the authoritative bundle and are ignored under `.lore/visualisations/`.

## Knowledge structure

Lore requires a non-empty concept `type`, but does not prescribe a type vocabulary, folder hierarchy, body template, relationship ontology, or set of lifecycle status values. Unknown YAML frontmatter is preserved. An absent lifecycle status remains unspecified, while absent verification is reported as `unverified`.

Bundles may store an evolving ontology as ordinary concepts. That ontology remains user-owned and advisory: Lore does not reject otherwise valid knowledge merely because it is not classified by the ontology.

## Mutation

`put` is the content mutation command. It accepts `create`, `merge`, and guarded `replace` requests:

```json
{
  "mode": "merge",
  "frontmatter": {"type": "Concept", "title": "Example"},
  "body_file": "/tmp/example.md",
  "relations": [["related_to", "another-concept"]],
  "expected_hash": "optional-hash-from-get"
}
```

Use either `body` or `body_file`. Merge preserves omitted frontmatter, unknown extensions, provenance, verification, generated metadata, and the existing body. Replace requires `allow_destructive: true`. Writes are validated and atomic; Lore does not rewrite `index.md` or `log.md`.

For a lifecycle-only change, use the dedicated deterministic command with the current hash returned by `get`:

```bash
lore status knowledge/example reviewed --expected-hash HASH
```

Status values are user-defined. The command preserves the concept body and all other frontmatter.

## Development

Requires Bun 1.3.14 for development only:

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

## Agent skill

The canonical agent skill is versioned at [`skills/use-lore`](skills/use-lore). It teaches a skill-capable agent to use Lore for storage, retrieval, graph traversal, validation, and guarded mutation without imposing a subject-matter taxonomy or duplicating Lore's deterministic behavior.

Install the whole `skills/use-lore` directory into the target agent's skill search path, either by copying it or linking back to this checkout. For example:

```bash
cp -R skills/use-lore /path/to/agent/skills/use-lore
```

The skill and executable are separate deliverables. The skill uses only the repository-local `.lore/bin/lore` executable. It never invokes the TypeScript source, Bun, Node.js, npm, package scripts, a compiler, `LORE_BIN`, or a globally installed executable.

### Repository-local setup

The skill does not download or install executables. Download and verify Lore using the platform instructions above, then initialize the target repository before using the skill:

```bash
/path/to/downloaded/lore init --repo /path/to/repository
```

Initialization creates:

```text
<repository>/.lore/
├── bin/lore          # repository-local compiled executable
├── cache/            # disposable SQLite state
├── knowledge/        # authoritative, portable OKF Markdown
│   └── index.md
├── visualisations/   # disposable HTML graphs, created on demand
└── .gitignore        # ignores bin/, cache/, and visualisations/
```

The agent invokes the repository-local binary with:

```bash
OKF_CACHE_DIR=/path/to/repository/.lore/cache \
  /path/to/repository/.lore/bin/lore info \
  --bundle /path/to/repository/.lore/knowledge
```

The project-local `.lore/knowledge` convention removes the need to set `OKF_BUNDLE`. Keep `OKF_BUNDLE` only when intentionally pointing Lore at an external or shared bundle.

## Releases

Pull requests and pushes to `main` run the test, type-check, native-build, and compiled smoke-test workflow. They do not publish releases.

To publish the version declared in `package.json`, create and push the matching tag from a commit contained in `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds and smoke-tests Linux x64/ARM64, macOS Intel/ARM64, and Windows x64 binaries on matching GitHub-hosted runners. It publishes those five binaries and `SHA256SUMS` to the resulting GitHub Release.
