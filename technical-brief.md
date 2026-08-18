# Agent-Native OKF Utility — Technical Design Brief

## 1. Objective

Build a lightweight, agent-native command-line utility named **`okf`** for efficiently creating, querying, linking, validating and maintaining Open Knowledge Format knowledge bundles.

The utility should complement OKF rather than replace or wrap it in another knowledge platform.

The fundamental architecture is:

```text
OKF Markdown files = authoritative knowledge
okf binary         = deterministic knowledge operations
SQLite             = disposable search/graph acceleration
LLM/Agent           = creation and reasoning
```

The primary consumers of `okf` are **AI coding agents and systemic tooling**, not humans.

Therefore:

* CLI input/output should be optimised for machines.
* JSON is the default and only required output format.
* Control structures may favour compactness and determinism over human presentation.
* No interactive UI is required.
* No decorative terminal output is required.
* No LLM should be embedded in the utility.
* No server or daemon should be required.
* No external database should be required.
* No network access should be required for normal operation.

The initial implementation should deliberately remain small.

---

# 2. Design Principles

## 2.1 OKF remains the source of truth

The utility MUST NOT create a proprietary knowledge store.

An OKF bundle must remain valid and usable if `okf` and all of its caches are deleted.

```text
Bundle
├── index.md
├── systems/
│   └── okta.md
├── capabilities/
│   └── customer-identity.md
└── decisions/
    └── identity-provider.md
```

The Markdown/YAML documents are authoritative.

SQLite is only a compiled acceleration structure.

---

## 2.2 Separate the knowledge plane from the control plane

### Knowledge plane

Portable OKF:

```text
Markdown body
YAML frontmatter
Markdown links
directory hierarchy
sources
verification
freshness
lifecycle
```

### Control plane

Agent-oriented structures:

```text
JSON CLI protocol
SQLite indexes
BM25 search scores
graph edges
typed relationship metadata
hashes
cache state
validation results
exit codes
```

Do not make control information verbose merely to improve human readability.

---

## 2.3 Deterministic operations before model reasoning

The utility should perform algorithmic work itself.

Do NOT require an LLM for:

* concept lookup
* full-text search
* metadata filtering
* backlinks
* graph traversal
* shortest paths
* freshness calculation
* trust-tier calculation
* broken-link detection
* orphan detection
* index maintenance
* validation
* filesystem path calculation
* concept ID resolution

LLMs should operate above `okf`:

```text
question
   ↓
okf find
   ↓
okf graph
   ↓
okf get
   ↓
small relevant knowledge set
   ↓
LLM reasoning
```

---

# 3. Standards Baseline

Target **OKF v0.2** initially.

The current specification defines a bundle as a self-contained hierarchical collection of Markdown knowledge documents, with concept IDs derived from bundle-relative paths. It deliberately does not prescribe query infrastructure and requires consumers to tolerate unknown additional frontmatter keys.

That extensibility allows `okf` to add optional machine-oriented control metadata without breaking OKF conformance.

Google's reference producer agent currently exposes a similarly small deterministic tool surface: concept listing, raw concept inspection, sampling/source inspection, reading existing knowledge and writing a concept.

Our utility extends this philosophy primarily into the **consumption, graph and maintenance side**.

---

# 4. Runtime and Distribution

## Runtime

Use:

```text
Bun
TypeScript
bun:sqlite
```

Target **zero production npm dependencies where practical**.

Bun can compile TypeScript into a standalone executable containing the Bun runtime, and `bun:sqlite` is supported inside standalone compiled binaries.

Use Bun built-ins wherever appropriate:

```text
bun:sqlite          SQLite
Bun.YAML.parse      frontmatter parsing
Bun.markdown        Markdown parsing/link extraction
Bun/CryptoHasher    hashing
Bun.Glob            bundle scanning, if useful
```

Bun has native runtime YAML parsing, avoiding a YAML parser dependency.

Bun also exposes a Markdown parser with callbacks including structured link metadata, which should be preferred over regex-based Markdown link extraction.

---

# 5. Distribution Model

Build one standalone binary per target platform and publish them as GitHub Release assets.

Initial target set:

```text
okf-darwin-arm64
okf-darwin-x64
okf-linux-x64
okf-linux-arm64
okf-windows-x64.exe
```

Additional platforms can be added only when CI can adequately test them.

No Bun installation should be required by the end user.

No Node installation should be required.

No SQLite installation should be required.

No package installation should be required.

Bun supports standalone compilation and cross-target compilation.

Publish alongside binaries:

```text
SHA256SUMS
```

Signing/notarisation can be added after the basic release pipeline works.

---

# 6. Repository Structure

Suggested initial layout:

```text
okf/
├── src/
│   ├── cli.ts
│   │
│   ├── commands/
│   │   ├── info.ts
│   │   ├── index.ts
│   │   ├── find.ts
│   │   ├── get.ts
│   │   ├── graph.ts
│   │   ├── put.ts
│   │   └── check.ts
│   │
│   ├── okf/
│   │   ├── bundle.ts
│   │   ├── concept.ts
│   │   ├── frontmatter.ts
│   │   ├── markdown.ts
│   │   ├── links.ts
│   │   └── ids.ts
│   │
│   ├── index/
│   │   ├── database.ts
│   │   ├── schema.ts
│   │   ├── refresh.ts
│   │   ├── search.ts
│   │   └── graph.ts
│   │
│   ├── mutation/
│   │   ├── put.ts
│   │   └── atomic-write.ts
│   │
│   └── protocol/
│       ├── result.ts
│       ├── errors.ts
│       └── exit-codes.ts
│
├── test/
│   ├── fixtures/
│   ├── unit/
│   └── integration/
│
├── package.json
├── bun.lock
├── tsconfig.json
└── .github/
    └── workflows/
        ├── test.yml
        └── release.yml
```

Avoid introducing abstraction layers until repeated behaviour justifies them.

---

# 7. Bundle Resolution

All commands operate against exactly **one bundle** in v0.1.

Resolve bundle root in this order:

```text
1. --bundle <path>
2. OKF_BUNDLE environment variable
3. current working directory
```

Do not automatically walk parent directories looking for a bundle. That introduces ambiguity for agents.

Normalise paths internally to absolute filesystem paths.

Concept IDs always use `/`, including on Windows.

Example:

```text
systems/okta
```

Never expose Windows path separators as concept IDs.

Workspace/federated multi-bundle search is explicitly deferred.

---

# 8. Cache Location

Do **not** place SQLite inside the OKF bundle by default.

Keep the source repository completely clean.

Store the derived cache in the operating-system cache area using a stable hash of the canonical bundle path.

Conceptually:

```text
macOS:
~/Library/Caches/okf/<bundle-hash>/index.db

Linux:
${XDG_CACHE_HOME:-~/.cache}/okf/<bundle-hash>/index.db

Windows:
%LOCALAPPDATA%\okf\cache\<bundle-hash>\index.db
```

Support:

```text
OKF_CACHE_DIR
```

for CI/tests/custom environments.

Consequences:

* cloning an OKF repo creates no generated files;
* `git status` remains clean;
* deleting the cache is harmless;
* changing checkout paths simply causes an index rebuild.

`okf info` should expose the resolved cache path.

---

# 9. SQLite Role

SQLite is a **derived knowledge acceleration structure**.

It provides:

```text
full-text search
BM25 ranking
graph adjacency
reverse links
typed relationships
incremental indexing state
```

SQLite FTS5 provides built-in BM25 ranking.

Do not add a vector database in v0.1.

Do not generate embeddings in v0.1.

---

# 10. SQLite Schema

Keep the schema deliberately small.

## Concepts

```sql
CREATE TABLE concept (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    title         TEXT,
    description   TEXT,
    status        TEXT,
    stale_after   TEXT,
    hash          TEXT NOT NULL,
    mtime_ms      INTEGER,
    size_bytes    INTEGER
);
```

## Full-text search

```sql
CREATE VIRTUAL TABLE concept_fts USING fts5(
    id UNINDEXED,
    title,
    description,
    tags,
    body
);
```

Initial ranking weights:

```text
title        8
description  4
tags         3
body         1
```

Search relevance should be exposed as:

```text
score = -bm25(...)
```

so **higher values mean better matches**.

Do not expose SQLite's unintuitive lower-is-better ranking semantics directly to agents.

---

## Graph

```sql
CREATE TABLE edge (
    src     TEXT NOT NULL,
    rel     TEXT NOT NULL,
    dst     TEXT NOT NULL,
    origin  TEXT NOT NULL,
    PRIMARY KEY (src, rel, dst, origin)
);

CREATE INDEX edge_src ON edge(src);
CREATE INDEX edge_dst ON edge(dst);
CREATE INDEX edge_rel ON edge(rel);
```

Do not enforce a foreign key on `dst`.

A missing destination is useful information because it represents a broken relationship that `okf check` should detect.

Possible `origin` values initially:

```text
markdown
typed
```

---

## Metadata

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Use for:

```text
schema_version
tool_version
bundle_path
last_indexed
```

---

# 11. Incremental Indexing

Normal read/query commands should ensure the index is current automatically.

The user/agent should not normally need:

```text
okf index
```

Algorithm:

```text
scan concept Markdown files
        ↓
compare path + mtime + size
        ↓
hash only potentially changed files
        ↓
reparse changed/new files
        ↓
remove deleted concepts
        ↓
update FTS + edges transactionally
        ↓
execute command
```

Concept content hash should be authoritative for change detection.

mtime/size are only fast prechecks.

All index updates should occur inside SQLite transactions.

`okf index` remains available for:

```text
explicit rebuild
CI
testing
diagnostics
```

Example:

```bash
okf index --rebuild
```

---

# 12. OKF Parsing

Concept files are all `.md` files excluding reserved files:

```text
index.md
log.md
```

at any level.

For each concept:

1. split YAML frontmatter from Markdown body;
2. parse YAML using `Bun.YAML.parse`;
3. validate mandatory OKF fields;
4. derive concept ID from relative path without `.md`;
5. extract searchable fields;
6. extract Markdown links;
7. parse optional typed relationships;
8. populate SQLite.

Ignore `.git` and hidden/system directories during scanning.

---

# 13. Markdown Link Graph

Normal OKF Markdown links automatically produce untyped graph edges.

Example:

```markdown
Okta implements [Customer Identity](../capabilities/customer-identity.md).
```

Indexed as:

```text
systems/okta
    --links_to-->
capabilities/customer-identity
```

Use Bun's Markdown parser to extract link targets rather than regular expressions.

Resolve relative links against the source concept's directory.

Only links resolving to `.md` concept documents within the current bundle become graph edges.

External HTTP links remain provenance/content but are not graph nodes.

Fragments should resolve to the concept:

```text
../systems/okta.md#authentication
```

becomes:

```text
systems/okta
```

Image links are not graph edges.

---

# 14. Typed Relationship Extension

Support an optional machine-oriented OKF extension:

```yaml
x-okf:
  rel:
    - [implements, capabilities/customer-identity]
    - [owned_by, teams/identity]
    - [depends_on, systems/kafka]
```

This deliberately favours compact machine representation.

The second tuple element is always a **canonical concept ID**, never a relative filesystem path.

Relationship names should initially match:

```text
[a-z][a-z0-9_]*
```

Do not define a mandatory enterprise ontology.

Suggested common relationships are documentation/convention only:

```text
related_to
depends_on
implements
uses
owned_by
supersedes
derived_from
```

Custom relationship names MUST remain valid.

Typed relations become graph edges with:

```text
origin = typed
```

Normal Markdown links continue to exist independently.

This lets `okf` provide rich graph semantics without making other OKF consumers dependent on the extension.

---

# 15. Frontmatter Serialization

The utility must be able to **read normal YAML frontmatter**.

For documents it writes or materially rewrites, prefer a deterministic machine-oriented representation.

One acceptable v0.1 strategy is **JSON-compatible YAML frontmatter**:

```markdown
---
{
  "type": "System",
  "title": "Okta",
  "description": "Customer identity platform",
  "x-okf": {
    "rel": [
      ["implements", "capabilities/customer-identity"]
    ]
  }
}
---

# Okta

...
```

JSON is valid YAML 1.2, so this remains YAML frontmatter while giving us:

* deterministic serialization;
* no YAML serializer dependency;
* stable machine parsing;
* straightforward preservation of nested structures;
* simpler tests.

`okf` must nevertheless accept ordinary YAML authored by other producers.

When rewriting an existing document, preserve all unknown frontmatter keys semantically.

Do not discard valid OKF extension fields merely because `okf` does not understand them.

---

# 16. CLI Protocol

The CLI has seven initial commands:

```text
okf info
okf index
okf find
okf get
okf graph
okf put
okf check
```

Do not add aliases or convenience commands in v0.1.

JSON is the default output.

There is no `--json` flag.

No ANSI.

No tables.

No banners.

No progress bars.

No conversational messages.

---

# 17. JSON Response Contract

Successful command:

```json
{
  "ok": true,
  "data": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "CONCEPT_NOT_FOUND",
    "message": "Concept does not exist",
    "details": {
      "id": "systems/missing"
    }
  }
}
```

Success JSON goes to stdout.

Error JSON goes to stderr.

Use compact JSON by default.

---

# 18. Exit Codes

Define stable exit semantics from the beginning.

```text
0   success
2   invalid command or arguments
3   invalid OKF / validation failure
4   concept or bundle not found
5   mutation conflict
6   unsupported capability
10  internal error
```

Do not encode application state only in human-readable error messages.

---

# 19. `okf info`

Purpose:

* orient an agent;
* report bundle state;
* expose supported runtime capabilities.

Example:

```bash
okf info
```

```json
{
  "ok": true,
  "data": {
    "bundle": "/repo/knowledge/identity",
    "okf_version": "0.2",
    "tool_version": "0.1.0",
    "concepts": 148,
    "edges": 392,
    "cache": {
      "path": "/Users/x/Library/Caches/okf/abc/index.db",
      "current": true
    },
    "capabilities": {
      "sqlite": true,
      "fts5": true,
      "bm25": true,
      "typed_relations": true
    }
  }
}
```

---

# 20. `okf index`

Explicit control over the derived index.

```bash
okf index
```

incrementally refreshes.

```bash
okf index --rebuild
```

deletes/recreates the derived database.

Example response:

```json
{
  "ok": true,
  "data": {
    "concepts": 148,
    "edges": 392,
    "added": 2,
    "updated": 4,
    "deleted": 1,
    "unchanged": 141
  }
}
```

---

# 21. `okf find`

Primary lexical discovery operation.

```bash
okf find "customer identity"
```

Optional filters:

```text
--type
--tag
--status
--scope
--limit
```

Example:

```bash
okf find "customer identity" --type Capability --limit 10
```

Response:

```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "id": "capabilities/customer-identity",
        "type": "Capability",
        "title": "Customer Identity",
        "description": "Provides customer authentication and identity services.",
        "score": 5.827
      },
      {
        "id": "systems/okta",
        "type": "System",
        "title": "Okta",
        "score": 3.913
      }
    ]
  }
}
```

Natural search strings should be safely converted into an FTS5 query rather than requiring agents to understand FTS5 syntax.

Raw FTS syntax can be deferred.

---

# 22. `okf get`

Retrieve knowledge.

```bash
okf get systems/okta
```

Default response should include:

```text
id
frontmatter
body
```

Example:

```json
{
  "ok": true,
  "data": {
    "id": "systems/okta",
    "frontmatter": {
      "type": "System",
      "title": "Okta"
    },
    "body": "# Okta\n\n..."
  }
}
```

Support section-level retrieval:

```bash
okf get systems/okta --section "Authentication"
```

Section extraction should preserve the original Markdown.

The purpose is token-efficient progressive disclosure.

---

# 23. `okf graph`

One graph command should cover neighbourhoods, backlinks, traversal and paths.

## Immediate neighbourhood

```bash
okf graph systems/okta
```

Default:

```text
depth = 1
direction = both
```

## Backlinks

```bash
okf graph systems/okta --direction in
```

## Outbound

```bash
okf graph systems/okta --direction out
```

## Traversal

```bash
okf graph systems/okta --depth 3
```

## Relationship filter

```bash
okf graph systems/okta --rel depends_on
```

## Shortest path

```bash
okf graph apps/checkout --to systems/okta
```

Response structure:

```json
{
  "ok": true,
  "data": {
    "root": "systems/okta",
    "nodes": [
      {
        "id": "systems/okta",
        "type": "System"
      },
      {
        "id": "capabilities/customer-identity",
        "type": "Capability"
      }
    ],
    "edges": [
      {
        "from": "systems/okta",
        "rel": "implements",
        "to": "capabilities/customer-identity",
        "origin": "typed"
      }
    ]
  }
}
```

Implement breadth-first traversal in TypeScript over SQLite adjacency data.

Do not introduce a graph database.

Set a defensive maximum traversal depth initially, e.g. 8.

---

# 24. `okf put`

This is the only mutation primitive required initially.

It should handle create and update safely.

The agent should not calculate final document paths itself.

Concept ID determines the destination:

```text
systems/okta
```

becomes:

```text
<bundle>/systems/okta.md
```

Preferred structured invocation:

```bash
okf put systems/okta < request.json
```

Example request:

```json
{
  "mode": "merge",
  "frontmatter": {
    "type": "System",
    "title": "Okta",
    "description": "Customer identity platform"
  },
  "body_file": "/tmp/okta-body.md",
  "relations": [
    ["implements", "capabilities/customer-identity"],
    ["owned_by", "teams/identity"]
  ]
}
```

Support modes:

```text
create
merge
replace
```

Default:

```text
merge
```

### Merge semantics

When updating:

* preserve unknown frontmatter;
* preserve existing `sources` unless explicitly changed;
* preserve verification metadata unless explicitly changed;
* preserve existing body when no new body is supplied;
* merge/update `x-okf.rel`;
* update `generated` metadata appropriately;
* validate before writing;
* write atomically;
* refresh the derived index after success.

`replace` should require:

```json
{
  "allow_destructive": true
}
```

The safety philosophy should resemble Google's reference writer: refine existing knowledge instead of blindly destroying it.

---

# 25. `okf check`

Perform deterministic bundle validation.

```bash
okf check
```

Check at minimum:

### Errors

```text
invalid frontmatter
missing required type
invalid concept ID
unresolvable internal relationship
malformed x-okf.rel
case-colliding concept IDs
invalid reserved-file structure where enforced by OKF
```

### Warnings

```text
stale concepts
deprecated concepts still referenced
orphan concepts
broken Markdown links
typed relationships with missing targets
```

Example:

```json
{
  "ok": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [
      {
        "code": "STALE_CONCEPT",
        "concept": "systems/legacy-api",
        "stale_after": "2026-07-01"
      }
    ]
  }
}
```

Warnings do not cause non-zero exit by default.

Support:

```bash
okf check --strict
```

to fail on warnings in CI.

Do not perform external HTTP link validation in v0.1.

---

# 26. Freshness and Trust

Where OKF v0.2 provides structured metadata, derive results deterministically.

For example:

```text
stale_after
verified
status
```

Do not invent independent trust scores in v0.1.

If useful, `get`, `find` or `info` may expose the OKF-derived trust tier:

```text
unverified
machine_confirmed
human_reviewed
```

but this should remain directly derivable from OKF rather than becoming proprietary persisted state.

---

# 27. Search + Graph Strategy

v0.1 should use lexical retrieval first.

```text
FTS5/BM25
     ↓
candidate concepts
     ↓
graph traversal
     ↓
relevant neighbouring knowledge
     ↓
agent reasoning
```

This enables multi-hop discovery without embeddings.

Future ranking may combine:

```text
lexical relevance
graph proximity
freshness
trust
```

but do not implement speculative scoring complexity before basic retrieval has been measured.

---

# 28. Explicit Non-Goals for v0.1

Do NOT build:

```text
MCP server
HTTP API
daemon
background watcher
web UI
graph UI
vector database
embedding generation
LLM integration
automatic web crawling
automatic summarisation
Neo4j
Postgres
remote knowledge service
multi-user permissions
bundle federation
workspace management
fixed enterprise ontology
plugin framework
Homebrew package
npm-distributed runtime
```

Any of these can be layered over the CLI later.

The initial value is the small deterministic core.

---

# 29. Release Validation

Every published binary must pass a runtime capability smoke test.

At minimum verify:

```sql
CREATE VIRTUAL TABLE fts_test USING fts5(content);

INSERT INTO fts_test VALUES ('customer identity authentication');
INSERT INTO fts_test VALUES ('payments settlement');

SELECT bm25(fts_test)
FROM fts_test
WHERE fts_test MATCH 'identity';
```

If this does not work on a target binary, that binary should not be released as supporting the search capability.

Also execute:

```text
okf info
okf index
okf find
okf get
okf graph
okf check
```

against a small fixture bundle using the compiled executable rather than only running TypeScript unit tests.

---

# 30. Test Fixtures

Create a deliberately small fixture bundle exercising graph behaviour:

```text
fixture/
├── index.md
├── capabilities/
│   ├── customer-identity.md
│   └── payments.md
├── systems/
│   ├── okta.md
│   └── payment-api.md
├── teams/
│   └── identity.md
└── decisions/
    └── identity-provider.md
```

Include:

```text
normal links
backlinks
typed relationships
broken link
stale concept
deprecated concept
unknown frontmatter
nested paths
cross-directory relative links
```

Tests should prove that deleting SQLite and rebuilding produces equivalent query results.

---

# 31. Implementation Sequence

## Milestone 1 — Foundation

Implement:

```text
bundle resolution
concept ID handling
frontmatter parsing
Markdown parsing/link extraction
JSON protocol
error model
info
```

Acceptance:

```text
okf info
```

can correctly inspect a fixture bundle.

---

## Milestone 2 — Index and Search

Implement:

```text
SQLite cache
incremental indexing
FTS5
BM25 ranking
index
find
```

Acceptance:

```text
okf find "customer identity"
```

returns correctly ranked fixture concepts.

Deleting the cache and rerunning produces equivalent results.

---

## Milestone 3 — Retrieval and Graph

Implement:

```text
get
Markdown link edges
typed relationship parsing
backlinks
BFS traversal
shortest path
graph
```

Acceptance:

```text
okf graph apps/checkout --to systems/okta
```

can return the correct multi-hop path in a fixture.

---

## Milestone 4 — Validation

Implement:

```text
check
broken relationships
stale concepts
orphans
case collisions
strict mode
```

---

## Milestone 5 — Mutation

Implement:

```text
put
merge semantics
atomic write
typed relations
generated metadata
post-write index refresh
```

Pay particular attention to preventing accidental metadata loss.

---

## Milestone 6 — Distribution

Implement GitHub Actions for:

```text
tests
compiled binaries
runtime smoke tests
SHA256 checksums
GitHub Release publishing
```

---

# 32. Definition of Done for v0.1

v0.1 is complete when an AI coding agent with ordinary shell access can use only the `okf` executable to:

1. discover the active bundle;
2. search concepts using BM25;
3. retrieve a complete concept;
4. retrieve a specific Markdown section;
5. find incoming and outgoing links;
6. traverse several graph hops;
7. find a shortest path between concepts;
8. distinguish normal links from typed relationships;
9. create a concept;
10. safely update an existing concept;
11. validate the bundle;
12. detect stale/broken/orphaned knowledge;
13. rebuild all derived state from the OKF Markdown alone.

The binary must require no runtime installation or service.

---

# 33. Architectural Invariants

These are not implementation suggestions. They are constraints.

### Invariant 1

```text
Markdown is authoritative.
SQLite is disposable.
```

### Invariant 2

```text
Deleting every okf cache must never lose knowledge.
```

### Invariant 3

```text
An existing conformant OKF bundle should remain usable without okf.
```

### Invariant 4

```text
Unknown OKF metadata must not be destroyed merely because okf does not understand it.
```

### Invariant 5

```text
Agent operations return structured JSON.
```

### Invariant 6

```text
No LLM is required for deterministic knowledge-management operations.
```

### Invariant 7

```text
No external database or service is required.
```

### Invariant 8

```text
A concept is addressed by canonical concept ID, not filesystem path, at the CLI boundary.
```

### Invariant 9

```text
Do not add an abstraction until the current implementation demonstrates a need for it.
```

---

# 34. Product Mental Model

The intended end-state is deliberately simple:

```text
                    AI Agent
                       │
                       │ shell
                       ▼
                  ┌─────────┐
                  │   okf   │
                  └────┬────┘
                       │
          ┌────────────┼─────────────┐
          │            │             │
       SEARCH         GRAPH        MUTATE
          │            │             │
       FTS5/BM25     SQLite        validated
          │           edges        atomic IO
          └────────────┼─────────────┘
                       │
                 derived cache
                       │
                       ▼
              ┌────────────────┐
              │   OKF Bundle   │
              │                │
              │ Markdown/YAML  │
              │ source of truth│
              └────────────────┘
```

The utility is **not a knowledge platform**.

It is a small, deterministic runtime that makes OKF dramatically more useful to agents.

The goal is to allow an agent to operate on structured knowledge rather than repeatedly brute-forcing a directory of Markdown with an LLM.
