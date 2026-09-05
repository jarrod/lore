---
name: setup-lore
description: Install or upgrade the standalone Lore executable in the current repository using verified GitHub Release assets. Use when setting up Lore before querying or storing knowledge.
---

# Set up Lore

Install the official standalone binary into the repository the user is working in. Lore's `init` owns directory creation and installation. Preserve existing knowledge and do not compile source or install a runtime to run Lore.

Resolve the target repository to an absolute path. Inspect any existing `.lore/bin/lore` (`lore.exe` on Windows) with `--version`. Reuse an existing installation unless an upgrade or specific version was requested.

For a download, resolve https://api.github.com/repos/jarrod/lore/releases/latest once, or retrieve the explicitly requested release tag. Select a published, non-draft release and use its exact tag for both downloads so a concurrent release cannot mix versions. Inspect the host OS and architecture; assets are `lore-darwin-arm64`, `lore-darwin-x64`, `lore-linux-arm64`, `lore-linux-x64`, and `lore-windows-x64.exe`. Report unsupported hosts rather than guessing.

Download the selected executable and `SHA256SUMS` from that release into a fresh temporary directory. Verify exactly one checksum entry for the selected filename and require its SHA-256 digest to match before execution. Checksums verify download integrity; releases are currently unsigned and not notarised.

## macOS Bash example

Adapt these commands to the resolved tag, asset, repository, and temporary directory. These are command examples, not a script to install. Run sequentially and stop on any failure.

```bash
uname -s
uname -m
curl -fsSL https://api.github.com/repos/jarrod/lore/releases/latest
mktemp -d
```

After reading the release metadata, replace the placeholders below with literal resolved values. Run downloads and verification inside the temporary directory:

```bash
curl -fL -o lore-darwin-arm64 https://github.com/jarrod/lore/releases/download/<tag>/lore-darwin-arm64
curl -fL -o SHA256SUMS https://github.com/jarrod/lore/releases/download/<tag>/SHA256SUMS
awk '$2 == "lore-darwin-arm64" { print; count++ } END { if (count != 1) exit 1 }' SHA256SUMS > selected.sha256
shasum -a 256 -c selected.sha256
chmod u+x lore-darwin-arm64
./lore-darwin-arm64 --version
./lore-darwin-arm64 init --repo /absolute/repository
```

Require the downloaded binary's version to match the selected tag without `v`. Use `lore-darwin-x64` on Intel Macs. On Linux choose the matching Linux asset and use `sha256sum -c`. On Windows choose equivalent PowerShell commands: inspect OS architecture, download with `Invoke-WebRequest`, verify with `Get-FileHash -Algorithm SHA256`, and invoke the executable with `&`. Do not assume Bash, curl, or chmod is available on Windows.

## Verify setup

Read the installed executable's `--help`, then call `info`. Current local-first builds select their own `.lore/knowledge` and cache automatically. Older releases such as v0.1.0 require `info --bundle /absolute/repository/.lore/knowledge`; follow that binary's help. Never claim a newer behavior is available merely because the skill documents it.

Check that `info` succeeds and identifies the intended bundle. Report the installed version, executable path, knowledge path, and actual cache path. Remove only the temporary files created by this installation. Direct the user to `use-lore` for subsequent knowledge operations; it may need a new agent session to discover freshly installed skills.
