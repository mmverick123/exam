import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

type Rule = { from: string; disallow: string[] };

const project = process.argv[2];
const rulesByProject: Record<string, Rule[]> = {
  agent: [
    { from: 'contracts', disallow: ['application', 'providers', 'session', 'transport'] },
    { from: 'providers', disallow: ['application', 'session', 'transport'] },
    { from: 'application', disallow: ['session', 'transport'] },
    { from: 'session', disallow: ['transport'] },
  ],
  platform: [
    { from: 'frontend', disallow: ['backend'] },
    { from: 'backend/domain', disallow: ['backend/config', 'backend/http', 'frontend'] },
    { from: 'backend/config', disallow: ['backend/domain', 'backend/http', 'frontend'] },
  ],
};

const rules = rulesByProject[project];
if (!rules) throw new Error(`Unknown architecture profile: ${project}`);
const sourceRoot = path.resolve('src');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

async function main(): Promise<void> {
  const violations: string[] = [];
  for (const file of await sourceFiles(sourceRoot)) {
    const relativeFile = path.relative(sourceRoot, file).replaceAll('\\', '/');
    const rule = rules.find((candidate) => relativeFile === candidate.from || relativeFile.startsWith(`${candidate.from}/`));
    if (!rule) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
      const resolved = path.relative(sourceRoot, path.resolve(path.dirname(file), match[2]!)).replaceAll('\\', '/');
      if (rule.disallow.some((prefix) => resolved === prefix || resolved.startsWith(`${prefix}/`))) {
        violations.push(`${relativeFile} -> ${resolved}`);
      }
    }
  }
  if (violations.length > 0) throw new Error(`Architecture boundary violations:\n${violations.join('\n')}`);
  process.stdout.write(`${project} architecture boundaries passed.\n`);
}

void main();
