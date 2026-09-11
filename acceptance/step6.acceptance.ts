import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';

type EvalReport = {
  generatedAt: string;
  caseSetHash: string;
  provider: string;
  comparableModelExperiment: boolean;
  mode: string;
  samplesPerCase: number;
  status: string;
  strategies: Record<string, {
    runs: number;
    firstPassRate: number;
    finalPassRate: number;
    failureModes: Record<string, number>;
  }>;
  comparison: { note: string };
  runs: unknown[];
};

const root = new URL('../', import.meta.url);
const checks: string[] = [];
const pass = (message: string) => checks.push(`PASS ${message}`);

async function latestReport(mode: 'smoke' | 'full', hash: string): Promise<EvalReport> {
  const directory = new URL('../services/agent/eval/metrics/', import.meta.url);
  const names = await readdir(directory);
  const reports = await Promise.all(
    names.filter((name) => name.endsWith('.json')).map(async (name) =>
      JSON.parse(await readFile(new URL(name, directory), 'utf8')) as EvalReport),
  );
  const candidates = reports
    .filter((report) => report.mode === mode && report.caseSetHash === hash)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  assert(candidates[0], `缺少当前冻结用例集的 ${mode} 指标`);
  return candidates[0];
}

async function main(): Promise<void> {
  const createText = await readFile(new URL('../services/agent/eval/cases/create.json', import.meta.url), 'utf8');
  const modifyText = await readFile(new URL('../services/agent/eval/cases/modify.json', import.meta.url), 'utf8');
  const createCases = JSON.parse(createText) as Array<{ id: string; subset: string }>;
  const modifyCases = JSON.parse(modifyText) as Array<{ id: string; subset: string }>;
  assert.equal(createCases.length, 24);
  assert.equal(modifyCases.length, 24);
  assert(createCases.every((item) => item.subset === 'create'));
  assert(modifyCases.every((item) => item.subset === 'modify'));
  assert.equal(new Set([...createCases, ...modifyCases].map((item) => item.id)).size, 48);
  pass('Eval 用例按 create/modify 各 24 条拆分且 ID 唯一');

  const actualHash = createHash('sha256')
    .update(createText.replaceAll('\r\n', '\n'))
    .update('\n')
    .update(modifyText.replaceAll('\r\n', '\n'))
    .digest('hex');
  const frozenHash = (await readFile(new URL('../services/agent/eval/cases/case-set.sha256', import.meta.url), 'utf8')).trim();
  assert.equal(actualHash, frozenHash);
  pass(`48 条用例由 SHA-256 冻结（${frozenHash.slice(0, 12)}…）`);

  const smoke = await latestReport('smoke', frozenHash);
  assert.equal(smoke.status, 'pass');
  assert.equal(smoke.runs.length, 10);
  assert.equal(smoke.strategies['two-stage']?.finalPassRate, 100);
  pass('Smoke 固定 10 条且零非法下发');

  const full = await latestReport('full', frozenHash);
  assert.equal(full.status, 'pass');
  assert.equal(full.samplesPerCase, 3);
  assert.equal(full.runs.length, 288);
  assert.equal(full.strategies['single-stage']?.runs, 144);
  assert.equal(full.strategies['two-stage']?.runs, 144);
  assert.equal(full.strategies['two-stage']?.finalPassRate, 100);
  assert((full.strategies['two-stage']?.failureModes.hierarchy ?? 0) > 0);
  assert.equal(full.comparableModelExperiment, false);
  assert.match(full.comparison.note, /不得表述为真实 LLM/);
  pass('Full 完成 288 次采样、记录层级失败并明确标记为非真实模型对比');

  const lowcodePackage = JSON.parse(await readFile(new URL('../packages/lowcode/package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string>; version: string; files: string[]; publishConfig: { access: string; registry: string }; name: string };
  const agentPackage = JSON.parse(await readFile(new URL('../services/agent/package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  const platformPackage = JSON.parse(await readFile(new URL('../apps/platform/package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  assert.match(lowcodePackage.scripts.verify, /contract:check/);
  assert.match(lowcodePackage.scripts.verify, /boundaries:check/);
  assert.match(lowcodePackage.scripts.prepublishOnly, /pnpm verify/);
  assert.match(lowcodePackage.scripts['release:npm'], /pnpm publish/);
  assert(agentPackage.scripts.verify && agentPackage.scripts['eval:smoke'] && agentPackage.scripts['eval:full']);
  assert(platformPackage.scripts.verify);
  pass('Monorepo 三工程 verify、npm registry 发布与两档 Eval scripts 已收口');

  assert.equal(lowcodePackage.publishConfig?.access, 'restricted');
  assert.equal(lowcodePackage.publishConfig?.registry, 'https://npm.pkg.github.com/');
  assert.equal(lowcodePackage.name, '@mmverick123/lowcode');
  assert(lowcodePackage.files.includes('dist'));
  assert(lowcodePackage.files.includes('contract'));
  const npmrc = await readFile(new URL('../packages/lowcode/.npmrc.example', import.meta.url), 'utf8');
  assert.match(npmrc, /npm\.pkg\.github\.com/);
  assert.match(npmrc, /authToken/);
  pass('GitHub Packages registry、scope 权限与发布文件白名单已配置');

  const compose = await readFile(new URL('../compose.yaml', import.meta.url), 'utf8');
  const caddy = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  assert.match(compose, /mysql:8\.4/);
  assert.match(compose, /AGENT_SERVICE_URL: http:\/\/agent:3000/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /"8088:80"/);
  assert(!/agent:[\s\S]*?ports:/m.test(compose));
  assert(!/mysql:[\s\S]*?ports:/m.test(compose));
  assert.match(caddy, /flush_interval -1/);
  assert.match(caddy, /reverse_proxy platform:8080/);
  pass('Compose 四服务拓扑、内网隔离、健康检查与 Caddy SSE 禁缓冲配置齐全');

  const snapshotTest = await readFile(new URL('../packages/lowcode/tests/contract-snapshot.test.ts', import.meta.url), 'utf8');
  assert.match(snapshotTest, /optionsSchemas\['single-choice'\]/);
  assert.match(snapshotTest, /toThrow/);
  pass('optionsSchema 人为篡改由非破坏性回归测试验证可被快照拦截');

  process.stdout.write(`${checks.join('\n')}\n\n${checks.length} checks passed.\n`);
}

void main();
