import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('请通过 pnpm dev 启动项目');

const pnpmExtension = path.extname(pnpmCli).toLowerCase();
const pnpmCommand = ['.js', '.cjs', '.mjs'].includes(pnpmExtension)
  ? process.execPath
  : pnpmCli;
const pnpmPrefixArgs = pnpmCommand === process.execPath ? [pnpmCli] : [];

const definitions = [
  { name: 'agent', cwd: path.join(root, 'services', 'agent'), script: 'dev' },
  { name: 'platform-api', cwd: path.join(root, 'apps', 'platform'), script: 'dev' },
  { name: 'platform-web', cwd: path.join(root, 'apps', 'platform'), script: 'dev:web' },
];

const children = definitions.map(({ name, cwd, script }) => {
  const child = spawn(pnpmCommand, [...pnpmPrefixArgs, script], {
    cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (!stopping) {
      process.stderr.write(`[${name}] exited (${signal ?? code})\n`);
      stop(code || 1);
    }
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.stdout.write('Starting Agent :3001, Platform API :3000, Web :5173\n');
