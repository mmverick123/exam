import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type { EvalCase } from '../eval/types';

describe('frozen eval corpus', () => {
  it('contains balanced create/modify subsets and matches its frozen hash', async () => {
    const createText = await readFile(new URL('../eval/cases/create.json', import.meta.url), 'utf8');
    const modifyText = await readFile(new URL('../eval/cases/modify.json', import.meta.url), 'utf8');
    const expectedHash = (await readFile(new URL('../eval/cases/case-set.sha256', import.meta.url), 'utf8')).trim();
    const cases = [...JSON.parse(createText), ...JSON.parse(modifyText)] as EvalCase[];
    expect(cases).toHaveLength(48);
    expect(cases.filter((item) => item.subset === 'create')).toHaveLength(24);
    expect(cases.filter((item) => item.subset === 'modify')).toHaveLength(24);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(createHash('sha256').update(createText).update('\n').update(modifyText).digest('hex')).toBe(expectedHash);
  });
});
