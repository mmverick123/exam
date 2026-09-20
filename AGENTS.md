# Repository Agent Rules

## Lowcode package changes

Any change under `packages/lowcode` or any change that affects the lowcode contract, renderer, designer, or published package must be released before the task is considered complete.

1. Increment `packages/lowcode/package.json` to a new semver version; never overwrite a version already published.
2. If contract artifacts change, review the semver impact and update the contract snapshot with `pnpm --filter @mmverick123/lowcode contract:snapshot:update`.
3. Run the lowcode release workflow described in `.codex/skills/lowcode-release/SKILL.md`. The package must be published to `https://npm.pkg.github.com/` with repository metadata pointing to `mmverick123/exam`.
4. After publication, install the exact new alias version in the affected consumer. For shared lowcode changes, update both `apps/platform` and `services/agent`, then regenerate `pnpm-lock.yaml` and reinstall dependencies.
5. Verify the installed package version and run the affected consumer's typecheck/build before reporting completion.

Do not use `file:` dependencies, `pnpm link`, or a pre-publication version in a frozen lockfile as a substitute for publishing and installing the real package.
