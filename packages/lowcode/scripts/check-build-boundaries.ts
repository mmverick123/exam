import { readFile } from 'node:fs/promises';

const [contractBundle, rendererBundle] = await Promise.all([
  readFile(new URL('../dist/contract.js', import.meta.url), 'utf8'),
  readFile(new URL('../dist/renderer.js', import.meta.url), 'utf8'),
]);

if (/from\s*["']react["']|require\(["']react["']\)/.test(contractBundle)) {
  throw new Error('contract 构建产物不得依赖 React');
}
if (/designer|DESIGNER_STEP_STATUS/.test(rendererBundle)) {
  throw new Error('renderer 构建产物不得包含 designer 模块');
}
