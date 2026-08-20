---
name: use-lore
description: Use a repository-local standalone Lore binary to initialize, search, retrieve, relate, validate, and safely mutate a Lore knowledge bundle. Apply when an agent needs to store or work with durable repository knowledge without imposing a subject-matter taxonomy.
---

# Use Lore

Use Lore as a deterministic mechanism for durable knowledge. The user owns the content, vocabulary, classifications, and relationships. Lore supplies storage, retrieval, lifecycle metadata, verification signals, graph traversal, validation, and guarded mutation.

## Require the Standalone Binary

1. Determine the repository root being worked on.
2. Use `<repo-root>/.lore/bin/lore` as the only executable location on macOS.
3. If it is absent, stop and tell the user to obtain a trusted standalone executable and run `<downloaded-lore> init --repo <repo-root>`.
4. Run `<repo-root>/.lore/bin/lore --help` before using it.

Never invoke Lore's TypeScript source, Bun, Node.js, npm, a package script, compiler, `LORE_BIN`, or an executable from `PATH`. Installing this skill does not install Lore.

## Select the Bundle

Use a bundle explicitly supplied by the user; otherwise use `<repo-root>/.lore/knowledge`. If repository-local Lore is installed but that bundle is absent and setup is authorized, run `<repo-root>/.lore/bin/lore init --repo <repo-root>`.

For repository-local knowledge, run commands with:

```text
OKF_CACHE_DIR=<repo-root>/.lore/cache <repo-root>/.lore/bin/lore <command> --bundle <repo-root>/.lore/knowledge
```

Do not use an ordinary source root as a bundle. Keep disposable cache data outside the authoritative knowledge directory.

## Preserve Content Neutrality

- Do not assume that knowledge is software architecture, documentation, research, a decision, a task, a person, or any other domain.
- Do not invent a taxonomy, folder hierarchy, concept type, relationship vocabulary, lifecycle status, heading template, or required body structure merely because an example used one.
- Reuse a classification only when the bundle already uses it consistently and it accurately represents the user's intent.
- If no suitable classification exists, use the broad type `Concept` and a descriptive root-level concept ID. Do not invent a domain hierarchy to make the bundle look organized.
- Treat an ontology stored in the bundle as advisory user-owned knowledge. Reuse accepted terms where they fit; propose additions when they do not. Never silently expand or enforce the ontology.
- Record source claims, user statements, and agent inferences distinctly. Do not present agent interpretation as source content.
- Do not add `verified` metadata without evidence of who or what performed verification. Lore reports absent verification as `unverified`.
- Do not infer a lifecycle status. An absent status is unspecified. Use `lore status` when the user or recorded workflow supplies a status.

These rules constrain agent-authored structure, not the user's content. Preserve terminology and organization explicitly chosen by the user even when it differs from existing conventions.

## Choose the Smallest Operation

Use the smallest useful sequence:

1. Run `info` to orient a multi-step investigation or mutation.
2. Use `find` when given a topic and `get` when given a canonical ID.
3. Use `graph` only for relationships, backlinks, neighbourhoods, or paths.
4. Use `check` for bundle health or after mutation.
5. Use `put` for content changes and `status` for lifecycle-only changes.

Do not load every concept by default. Search for relevant concepts, traverse only useful relationships, and retrieve the minimum authoritative content needed to answer.

Read [references/cli.md](references/cli.md) when selecting command options, constructing mutation input, interpreting exits, or recovering from an error. Installed `--help` remains authoritative for the binary version.

## Answer from Evidence

Translate compact Lore JSON into a direct answer. Keep canonical concept IDs for traceability, and separate:

- what stored content explicitly records;
- what indexed relationships establish;
- what the agent inferred.

Mention lifecycle, trust, stale content, broken links, or missing targets when they materially affect confidence. Lore retrieves recorded knowledge; it does not prove every claim is true.

## Mutate Safely

Use `lore put` as the only content mutation primitive. Never edit concept Markdown directly.

Before updating an existing concept, use `get` and retain its hash. Merge by default, preserve omitted body and metadata, and pass `expected_hash`. Use replacement only when the user explicitly requests complete destructive replacement. After mutation, reread the concept and run `check`.

Use `lore status <concept-id> <status> --expected-hash <hash>` when only lifecycle status changes. Status values are user-defined; do not select one without user direction or an established bundle workflow.

When creating content:

1. Search for an existing concept to avoid duplication.
2. Consult relevant ontology or established bundle vocabulary if present.
3. Preserve the user's terminology and requested structure.
4. Use the least-assumptive type and location permitted by those inputs.
5. Add relationships only when supported by the content or explicitly supplied by the user.
6. Create with `put`, then retrieve and validate the result.

On a mutation conflict, reread the current content and reconcile only when doing so preserves the user's intent. Never force a destructive write merely to make a command succeed.
