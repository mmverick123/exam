import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createContractArtifacts, stableJson } from '../scripts/contract-artifacts';
import { assertContractSnapshot } from '../scripts/contract-snapshot';

describe('contract snapshot guard', () => {
  it('rejects an optionsSchema mutation without changing source files', async () => {
    const expected = await readFile(
      new URL('./snapshots/contract.snapshot.json', import.meta.url),
      'utf8',
    );
    const current = await createContractArtifacts();

    expect(() => assertContractSnapshot(expected, stableJson(current))).not.toThrow();

    const mutated = structuredClone(current) as {
      schema: {
        optionsSchemas: Record<string, {
          properties: Record<string, { type?: string }>;
        }>;
      };
    };
    const scoreSchema = mutated.schema.optionsSchemas['single-choice']?.properties.score;
    if (!scoreSchema) throw new Error('single-choice score schema is missing');
    scoreSchema.type = 'string';

    expect(() => assertContractSnapshot(expected, stableJson(mutated))).toThrow(
      '契约快照发生变化',
    );
  });
});
