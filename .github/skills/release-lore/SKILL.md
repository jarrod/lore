---
name: release-lore
description: "Publish a Lore version through its protected GitHub workflow: push a feature branch, verify and squash-merge its pull request, tag the exact main commit, monitor release Actions, and verify standalone executables and checksums. Use when preparing, publishing, resuming, or validating a Lore GitHub release."
---

# Release Lore

Publish `jarrod/lore` through its repository-controlled workflows. The release workflow, not this skill, builds and smoke-tests executables and creates the GitHub Release.

## Preserve the Release Boundary

Treat preparation and publication differently. A request to inspect, prepare, or assess readiness authorizes read-only checks, not pushing, merging, tagging, or rerunning workflows. Before the first external mutation, resolve and report the repository, branch, pull request, version, tag, and intended actions; obtain authorization unless the current request already explicitly authorizes that complete publication workflow.

Never force-push, bypass branch protection, push directly to `main`, rewrite or delete a tag, delete a release, or manually publish assets around the release workflow. Stop on unexpected state instead of broadening the operation. Use a temporary directory outside the repository for downloaded release assets.

## Resolve the Release

Use repository and GitHub state as the source of truth:

1. Confirm the repository is `jarrod/lore`, GitHub CLI authentication works, and `origin` is the intended remote.
2. Require a clean working tree. Do not discard, stash, or include unrelated changes.
3. Read the version from `package.json` and require the same value in `src/version.ts`. Require a stable semantic version and derive the exact tag as `v<version>`; never choose or bump a version implicitly.
4. Inspect `.github/workflows/test.yml` and `.github/workflows/release.yml`. Require the protected `required` check and these release assets:
   - `lore-darwin-arm64`
   - `lore-darwin-x64`
   - `lore-linux-arm64`
   - `lore-linux-x64`
   - `lore-windows-x64.exe`
   - `SHA256SUMS`
5. Fetch `origin/main` and tags. Check the exact tag and GitHub Release before publishing. If both already exist, switch to verification. If the tag exists without a successful release, inspect its workflow and stop rather than retagging. If the version is already released and a new release is intended, request a separate version-bump change.

Run `bun run check` and `bun run audit` before pushing release-bound changes. A failed local check blocks publication.

## Publish Through the Protected Pull Request

Resume from the first incomplete step; do not duplicate an existing branch, pull request, tag, workflow, or release.

1. Require a non-`main` feature branch for unmerged changes. Push that branch normally and create a pull request targeting `main` if one does not already exist.
2. Verify the pull request head is the pushed commit, its base is `main`, and its title and body describe the release-bound changes.
3. Wait for GitHub checks. Require the aggregate `required` check to succeed and the pull request to be mergeable. Do not merge with pending, skipped, cancelled, or failed required checks, unresolved conversations, or a stale head.
4. Squash-merge the pull request and request deletion of its remote branch. Do not use an administrative bypass.
5. Fetch `origin/main`, capture the resulting merge commit, and prove that the commit is the pull request's recorded merge commit and is contained in `origin/main`.

Do not tag the feature-branch commit. The release tag must identify the verified merged commit on `main`.

## Tag and Monitor the Release

Immediately before tagging, recheck that the derived tag and release are absent and that the merged commit still declares the expected version. Then create the lightweight tag at that exact commit and push only that tag.

Locate the `release` workflow run whose tag and head commit match the resolved release. Wait for it to finish. Require its validation, five native build-and-smoke jobs, and publish job to succeed. If it fails, inspect and report the failing job and logs. Do not move the tag or manually create the release. Rerun a failed workflow only when the user authorizes it and the failure is demonstrably transient.

## Verify Publication

After the workflow succeeds:

1. Require a non-draft, non-prerelease GitHub Release for the exact tag.
2. Require exactly the five executable names and `SHA256SUMS` listed above, with non-empty assets and no unexpected executable variant.
3. Download the six assets to a new temporary directory and verify every executable against `SHA256SUMS`. Remove the temporary directory after verification.
4. When the current machine matches a released asset, execute that downloaded binary with `--version` and require the exact unprefixed package version. The workflow's native smoke jobs remain the evidence for other platforms.
5. Report the pull request URL, merge commit, tag, release workflow URL, release URL, asset names, checksum result, and any compatible local version check.

Publication is complete only when the protected merge, tag workflow, GitHub Release, complete asset set, and checksums are all verified.
