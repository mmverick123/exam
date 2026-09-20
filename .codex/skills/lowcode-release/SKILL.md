---
name: lowcode-release
description: Publish the monorepo lowcode package to the current exam repository's GitHub Packages registry and install the exact release into its consumers.
---

# Lowcode release and installation

Use this skill when releasing `packages/lowcode` or updating a consumer (`apps/platform` or `services/agent`) to a published lowcode version.

## Canonical package destination

- Package name: `@mmverick123/lowcode`.
- Registry: `https://npm.pkg.github.com/`.
- Canonical source repository: `https://github.com/mmverick123/exam`.
- Package source directory: `packages/lowcode`.
- Consumers use the exact npm alias `@exam/lowcode@npm:@mmverick123/lowcode@<version>` so existing `@exam/lowcode/*` imports remain unchanged.

Do not publish to, or add a dependency on, the retired `exam-lowcode-lib` repository. The package's `repository.url` and `repository.directory` must stay pointed at `mmverick123/exam` and `packages/lowcode`. The GitHub Packages UI/API association is repository-owned metadata: before a first release from this monorepo, verify that the package is connected to the `exam` repository and that the publishing identity has package write permission. Never put a PAT in tracked files.

## Release workflow

1. Inspect the current package version, all consumer manifests, and the clean/dirty worktree. Choose a new semver version; never overwrite an already published version.
2. Update `packages/lowcode/package.json` (and the generated `contract/version.json` through the verification flow). If the contract/schema changes, run `pnpm --filter @mmverick123/lowcode contract:snapshot:update` after reviewing the semver impact.
3. Ensure GitHub Packages authentication is available through user-level npm configuration. Do not create or commit a token file.
4. Run the package's release command from the repository root:

   ```powershell
   pnpm release:lowcode
   ```

   This runs `prepublishOnly`, which performs lint, typecheck, widget-layout checks, contract generation/snapshot checks, tests, build, and build-boundary checks before publishing. If the workspace lockfile is stale because a consumer was already edited to the new unpublished version, temporarily keep consumers on the previous published version until the package is published; then update the lockfile after publication. Do not bypass `prepublishOnly` for a normal release.

5. After the registry confirms the new version, update every consumer that is intended to move (at minimum the consumer named by the user; normally both `apps/platform` and `services/agent`) with an exact alias. Prefer the package-manager command so the manifest and lockfile are updated together:

   ```powershell
   pnpm --dir apps/platform add @exam/lowcode@npm:@mmverick123/lowcode@<version> --save-exact
   pnpm --dir services/agent add @exam/lowcode@npm:@mmverick123/lowcode@<version> --save-exact
   pnpm install
   ```

   If only one consumer is in scope, update only that consumer and state the remaining consumer's version explicitly.

6. Verify that `pnpm-lock.yaml` resolves the new `@mmverick123/lowcode@<version>` tarball and that the installed consumer package points to that version. Run the affected consumer's typecheck/build (at minimum `apps/platform` typecheck and web build when platform was changed).

## Recovery rules

- `ERR_PNPM_NO_MATCHING_VERSION` means the package was not published yet; publish first, then regenerate the lockfile.
- `ERR_PNPM_OUTDATED_LOCKFILE` means a consumer manifest references an unpublished version; restore the previous published version while building/publishing, then update the manifest and lockfile after publication.
- If pnpm cannot download dependencies from the default store, use a writable workspace-local pnpm store; do not change package versions or registry URLs to work around a permissions error.
- If publishing fails during `prepublishOnly`, fix the reported verification failure. A contract snapshot failure after a deliberate contract/version change requires the snapshot update command; an unexplained snapshot change must be investigated rather than force-published.

## Handoff checklist

Report the published package/version, the GitHub repository association check, every consumer manifest changed, lockfile synchronization, and the verification commands/results. If external GitHub package association or credentials are unavailable, stop after safe local updates and identify that exact blocker.
