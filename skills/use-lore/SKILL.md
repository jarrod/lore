---
name: use-lore
description: Use the Lore CLI to investigate, explain, validate, and safely update Open Knowledge Format (OKF) bundles. Invoke for natural-language questions about a Lore knowledge bundle, concept discovery, targeted retrieval, dependencies, backlinks, relationship paths, knowledge-health checks, or guarded concept creation and editing.
---

# Use Lore

Use Lore as the deterministic knowledge interface, then translate its compact JSON into a direct answer for the user. Keep search, graph traversal, validation, and mutation in Lore; use agent reasoning only to choose operations, synthesize evidence, and explain results.

## Establish the Command and Bundle

1. Prefer an installed `lore` executable on `PATH`.
2. In a Lore source checkout without an installed executable, use `bun run src/cli.ts` from the repository root.
3. Pass `--bundle <absolute-path>` when the target bundle is known. Otherwise respect `OKF_BUNDLE`, then the current working directory. Never infer a bundle by searching parent directories.
4. Run `lore info` before a multi-step investigation or mutation. Run `lore --help` or `lore <command> --help` when command details are uncertain; help is structured JSON.

If the execution sandbox cannot write to the platform cache directory, set `OKF_CACHE_DIR` to a writable disposable directory outside the knowledge bundle. Do not request broader filesystem access solely for the derived cache.

If Lore is unavailable, state what is missing and how to make the executable available. Do not imitate Lore by directly parsing or rewriting the bundle.

## Handle the Protocol

Treat stdout as a compact JSON success envelope:

```json
{"ok":true,"data":{}}
```

Treat stderr as a compact JSON error envelope:

```json
{"ok":false,"error":{"code":"CONCEPT_NOT_FOUND","message":"Concept does not exist","details":{"id":"systems/missing"}}}
```

Inspect both the envelope and process exit code. Do not show raw envelopes unless the user asks; summarize the evidence in ordinary language and retain canonical concept IDs so conclusions remain traceable.

Exit codes have these meanings:

- `0`: success
- `2`: invalid command or arguments
- `3`: invalid OKF or strict validation failure
- `4`: concept or bundle not found
- `5`: mutation conflict
- `6`: unsupported runtime capability
- `10`: internal error

Do not retry argument, validation, capability, or internal errors blindly. Explain the actionable cause. On a mutation conflict, reread the concept and reconcile instead of overwriting it.

## Investigate Knowledge

Use the smallest useful sequence:

1. Start with `lore find <query>` when the user provides a topic rather than a canonical ID. Add `--type`, `--tag`, `--status`, or `--scope` only when the request supplies that constraint or the first result set is too broad.
2. Use `lore get <concept-id>` to inspect authoritative frontmatter, body, and current content hash. Use `--section <heading>` when only one section is needed.
3. Use `lore graph <concept-id>` for neighbours and backlinks. Set `--direction in` for references to the concept, `--direction out` for its dependencies, and `--direction both` for context.
4. Increase `--depth` deliberately for multi-hop questions. Use `--rel <relationship>` for a typed relationship and `--to <concept-id>` for a deterministic shortest path.
5. Run `lore check` for bundle-health questions. Use `--strict` only when warnings must fail a gate.

Do not load every concept by default. Search for seeds, traverse only relevant connections, then retrieve the concepts or sections needed to support the answer. Distinguish Markdown `links_to` edges from typed relationships and preserve edge origin when that distinction matters.

When evidence is incomplete or conflicting, say so. Lore retrieves recorded knowledge; it does not prove that the recorded claim is true.

## Explain Results

Lead with the answer, followed by the concepts and relationships that support it. Use canonical IDs such as `systems/payment-api`, not filesystem paths. Mention freshness, trust, deprecation, broken links, or missing targets when those properties affect confidence.

For broad questions, separate:

- what the bundle explicitly records;
- what follows from graph traversal;
- what is an agent inference.

Do not claim an absent search result proves an idea does not exist unless the relevant searches and relationship directions have been checked.

## Mutate Safely

Treat `lore put` as the only knowledge mutation primitive. Do not edit concept Markdown directly.

Before updating an existing concept:

1. Run `lore get <concept-id>` and retain its content hash.
2. Confirm the requested change and preserve the returned provenance, verification, generated metadata, unknown frontmatter, and body unless the user explicitly changes them.
3. Construct exactly one JSON request and pipe it to `lore put <concept-id>`. Include `expected_hash` for updates.
4. Run `lore get <concept-id>` again and then `lore check` to verify the result.

Prefer merge mode:

```json
{
  "mode": "merge",
  "frontmatter": {"title": "Payment API"},
  "expected_hash": "hash-returned-by-get"
}
```

For creation, provide a valid non-empty `type` and the intended body:

```json
{
  "mode": "create",
  "frontmatter": {"type": "System", "title": "Checkout"},
  "body": "# Checkout\n",
  "relations": [["depends_on", "systems/payment-api"]]
}
```

Supplying `relations` replaces the complete controlled `x-okf.rel` collection; omitting it preserves existing relations. Use either `body` or `body_file`, never both. Resolve `body_file` relative to the command's working directory.

Use replace mode only when the user explicitly requests complete destructive replacement. It requires an existing concept, complete replacement content, and `allow_destructive: true`. Never add destructive permission merely to make a failed request pass.

After exit code `5`, fetch the new hash, compare the user's requested change with current content, and ask for direction if reconciliation would change intent.

## Example Requests

- “What do we know about customer identity?” Find relevant concepts, retrieve the strongest matches, inspect nearby relationships, and synthesize the recorded answer.
- “What depends on Kafka?” Resolve Kafka to a canonical ID, traverse incoming edges, and retrieve important dependants before explaining impact.
- “How does Checkout reach Okta?” Resolve both IDs and use `graph --to` for the shortest recorded path.
- “Find stale or broken knowledge.” Run `check`, group findings by severity, and explain likely maintenance work.
- “Add Checkout as a system that depends on Payments.” Confirm the target relationship, create through `put`, reread it, and validate the bundle.
