---
name: use-lore
description: Operate a repository-local standalone Lore binary to initialize, query, traverse, validate, mutate, visualise, or reset an OKF knowledge bundle. Use for Lore mechanics and safety; leave knowledge extraction, classification, organization, and writing policy to the consumer.
---

# Use Lore

Use Lore as a deterministic interface to an OKF knowledge bundle. Lore owns storage mechanics, indexing, querying, graph traversal, validation, lifecycle metadata, and guarded mutation. The user or calling knowledge-worker workflow owns what knowledge means, how sources are interpreted, how many concepts are created, and how content is classified or organized.

## Locate Lore

1. Determine the repository root being worked on.
2. Use `<repo-root>/.lore/bin/lore.exe` on Windows and `<repo-root>/.lore/bin/lore` on macOS or Linux. Refer to the selected path as `<lore-executable>` below.
3. If it is absent, use setup-lore when available and installation is requested; otherwise explain that the standalone executable must be installed first.
4. Run `<lore-executable> --help` before first use. Installed help is authoritative for the binary version.

## Select the Bundle

The installed executable defaults to its sibling `.lore/knowledge`, with cache data in `.lore/cache`. Call it by its absolute path; no working-directory change is needed. Use `--bundle <path>` only when the user selects another bundle.

Check installed help: older releases such as v0.1.0 need `--bundle <repo-root>/.lore/knowledge` on knowledge commands. Offer setup-lore for an upgrade when newer releases are available.

## Command Contract

| Command     | Use it for                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------ |
| `init`      | Install the current executable and create repository-local Lore directories.               |
| `info`      | Inspect bundle identity, versions, counts, cache state, and capabilities.                  |
| `index`     | Refresh derived state; use `--rebuild` to recreate it from authoritative Markdown.         |
| `find`      | Search by natural lexical query with optional type, tag, status, scope, and limit filters. |
| `get`       | Retrieve one canonical concept, its hash, frontmatter, body, or an exact Markdown section. |
| `graph`     | Query relationships, backlinks, neighbourhoods, and shortest paths as structured JSON.     |
| `visualise` | Generate a disposable HTML graph when the user requests a human-readable view.             |
| `put`       | Create, merge, or explicitly replace one concept from a JSON request on stdin.             |
| `status`    | Change only the OKF lifecycle status with optional optimistic concurrency.                 |
| `check`     | Validate the bundle; use `--strict` when warnings must fail the operation.                 |
| `reset`     | Preview or explicitly confirm a complete recoverable or permanent knowledge reset.         |

Use `<lore-executable> <command> --help` for the exact options and protocol supported by the installed version.

## Query Efficiently

Use `find` for a topic and `get` for a canonical concept ID. Use `graph` when relationships, backlinks, neighbourhoods, or paths matter. Retrieve only the authoritative concepts needed for the task instead of loading the complete bundle by default.

`find` searches concept IDs and visible semantic Markdown, including code and image descriptions. Query knowledge terms rather than link destinations, image paths, or formatting syntax, which are not indexed.

Translate compact Lore JSON into the form required by the calling workflow. Preserve concept IDs for traceability and distinguish stored content, indexed relationships, and agent inference. Mention lifecycle, trust, staleness, or broken relationships when they materially affect confidence.

Use `visualise` only for a requested human-readable graph. Use `graph` JSON, not generated HTML layout, as evidence for agent reasoning.

## Preserve Consumer Policy

Lore requires valid OKF, including a non-empty concept `type`, but this skill must not choose a type vocabulary, taxonomy, folder hierarchy, document count, body template, prose style, relationship ontology, or ingestion strategy. Apply choices supplied by the user or calling knowledge-worker workflow. Preserve unknown metadata and user-selected organization.

Do not infer verification. Do not change lifecycle status unless directed by the user or an established consumer workflow. OKF lifecycle values are `draft`, `stable`, and `deprecated`; absent status is effectively `stable`.

## Mutate Safely

Use `put` as the content mutation primitive rather than editing concept Markdown directly.

```json
{
  "mode": "merge",
  "frontmatter": { "type": "consumer-selected-type" },
  "body_file": "/absolute/path/to/content.md",
  "relations": [["consumer_selected_relation", "target-concept"]],
  "expected_hash": "hash-returned-by-get"
}
```

Before updating an existing concept, call `get` and retain its hash. Merge by default, preserve omitted body and metadata, and pass `expected_hash`. Use replacement only when the user explicitly requests complete destructive replacement. A replacement request must include complete content and `allow_destructive: true`.

When `relations` is supplied it replaces the complete controlled `x-okf.rel` collection. Omit it to preserve existing typed relationships. Add only relationships selected or supported by the calling workflow.

Inspect `index.current` after mutation. If false, the Markdown write committed but the derived cache requires the reported recovery command. Once current, reread the concept and run `check`.

Use `status <concept-id> <draft|stable|deprecated> --expected-hash <hash>` when only lifecycle state changes. Store consumer-specific workflow states in namespaced metadata instead of overloading OKF `status`.

On a conflict, reread current content and return control to the calling workflow for reconciliation. Never force a destructive write merely to make a command succeed.

## Reset Safely

A reset requires an explicit user request to clear the complete resolved bundle. Never infer reset permission from initialization, cache rebuilding, deletion of one concept, cleanup, or validation repair.

Run `reset --knowledge` without `--confirm` first. This read-only preview returns the canonical bundle, counts, byte size, mode, recoverability, and a state-derived confirmation token. For a user-selected external bundle, pass the same explicit `--bundle` on preview and confirmation. Verify the target and show or use the preview as required by the caller's authorization model.

Only then pass the exact token to `reset --knowledge --confirm <token>`. Do not reuse a token across turns or retry a conflict without generating a fresh preview. A normal reset is recoverable and reports its backup path.

Use `--no-backup` only when the current request explicitly authorizes a permanent, unrecoverable reset. Include it in both preview and confirmation, verify `mode: permanent` and `recoverable: false`, and report that Lore retained no backup.
