# Contributing to Lore

Thank you for helping improve Lore.

## Before starting

Use GitHub Discussions for broad design exploration and open an issue for a reproducible defect or a scoped feature. Small, self-contained fixes may go directly to a pull request. For substantial behavior changes, agree on the problem and compatibility impact before implementation.

Lore keeps OKF Markdown and YAML authoritative and treats SQLite and visualisations as disposable derived state. Changes must preserve portable bundles, compact structured CLI output, path safety, unknown frontmatter, and deterministic operation without an LLM or service dependency.

Knowledge extraction, classification, document structure, and writing policy belong to consumer knowledge-worker workflows rather than the Lore binary or the operational `use-lore` skill.

## Development setup

Install Bun 1.4.0, then run:

```bash
bun install --frozen-lockfile
bun run check
```

`bun run check` runs lint, formatting, unused-code and type checks, tests, standalone compilation, and executable smoke tests. Add or update tests for observable behavior changes. Test the compiled binary whenever runtime packaging behavior changes.

Use `bun run fmt` to apply formatting before committing. The individual read-only checks are `bun run lint` (Oxlint), `bun run fmt:check` (Oxfmt), and `bun run knip` (unused files, exports, and dependencies). Run all three with `bun run hygiene:check`; CI requires them alongside platform tests and the dependency audit. These tools are development-only and do not affect the shipped executable.

Formatting excludes generated content and OKF fixtures, whose exact Markdown is test data. Knip discovers script and test entry points from package scripts and Bun conventions; declare new entry points only when automatic discovery cannot identify legitimate usage. Review findings before deleting code or dependencies.

Run the non-mutating high-severity dependency audit with:

```bash
bun run audit
```

Optional Bun 1.4 diagnostics write disposable reports under the ignored `dist` directory:

```bash
bun run analyze:build
bun run profile:index:cpu
bun run profile:index:heap
```

The index profilers rebuild the graph fixture 100 times by default. To profile a real bundle without modifying it, supply an absolute or relative bundle path; custom bundles default to one iteration:

```bash
bun run profile:index:cpu -- --bundle /path/to/knowledge --iterations 5
```

## Pull requests

- Create a branch from the current `main` branch.
- Keep the change focused and explain its user-visible effect and compatibility implications.
- Link related issues when one exists.
- Update documentation and tests with behavior changes.
- Ensure `bun run check` succeeds before requesting review.
- Do not commit generated binaries, caches, local `.lore` state, or secrets.
- Resolve review conversations and keep the branch current with `main`.

Pull requests require passing CI and maintainer review. The repository uses squash merging and deletes merged branches automatically.

## Releases

Maintainers publish releases by updating the package and tool versions together, merging the change to `main`, and pushing the matching `v<version>` tag. GitHub Actions builds and smoke-tests every supported executable before creating the release.

The repository-local [`release-lore` skill](.github/skills/release-lore/SKILL.md) guides maintainers through the protected pull request, tagging, workflow monitoring, and release verification sequence.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
