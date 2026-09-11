export function assertContractSnapshot(expected: string, actual: string): void {
  if (actual !== expected) {
    throw new Error(
      '契约快照发生变化。请确认 semver 影响后运行 pnpm contract:snapshot:update。',
    );
  }
}
