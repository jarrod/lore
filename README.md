# Lore

[![CI](https://github.com/jarrod/lore/actions/workflows/test.yml/badge.svg)](https://github.com/jarrod/lore/actions/workflows/test.yml)
[![GitHub Release](https://img.shields.io/github/v/release/jarrod/lore)](https://github.com/jarrod/lore/releases/latest)
[![License](https://img.shields.io/github/license/jarrod/lore)](LICENSE)

Lore gives AI agents a local knowledge store they can search, connect, and maintain. Knowledge stays in portable Markdown and YAML files using [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), under your control.

Use it to keep decisions, research, reference material, or any other knowledge alongside your project. You choose the content and organisation; Lore provides the tools to work with it.

## Features

- Search knowledge and retrieve whole documents or individual sections.
- Connect concepts, follow backlinks, and find paths through the knowledge graph.
- Open an interactive graph visualisation.
- Create and update content safely, with conflict detection and validation.
- Track lifecycle status, verification, stale content, and broken links.
- Run locally as a standalone executable, with no server or AI service required by Lore.

## Quick start

From your project directory, install the skills for your coding agent using [skills.sh](https://skills.sh):

```bash
npx skills@latest add jarrod/lore --skill setup-lore --skill use-lore
```

Ask your agent to install Lore:

> Use setup-lore to install Lore in this repository.

Then start building and exploring your knowledge:

> Use use-lore to store our decision to use PostgreSQL and the reasons behind it.

> Use use-lore to find our database decisions and show how they relate.

Knowledge is stored in `.lore/knowledge` in your project. To upgrade Lore later, ask your agent to use `setup-lore` to upgrade it.

### Without skills

Download a binary from [GitHub Releases](https://github.com/jarrod/lore/releases/latest), verify it against `SHA256SUMS`, and make it executable. From your project directory, run:

```bash
/path/to/lore init
./.lore/bin/lore info
```

Lore supports macOS, Linux, and Windows. Release binaries are unsigned and not notarised.

## Using the CLI

The skills handle the CLI for you. For direct use, a few examples:

```bash
./.lore/bin/lore find "database decisions"
./.lore/bin/lore get decisions/database
./.lore/bin/lore graph decisions/database
./.lore/bin/lore visualise --open
./.lore/bin/lore check
```

Commands return structured JSON for agents and scripts. Use `--help` for the full command reference.

## Contributing and support

See [Contributing](CONTRIBUTING.md) for development and release guidance. Report bugs or request features in [Issues](https://github.com/jarrod/lore/issues), and ask questions in [Discussions](https://github.com/jarrod/lore/discussions). For private vulnerability reports, see [Security](SECURITY.md).

## License

[Apache License 2.0](LICENSE).
