import { readFile } from 'node:fs/promises';

import { createContractArtifacts, stableJson } from './contract-artifacts';
import { assertContractSnapshot } from './contract-snapshot';

const snapshotFile = new URL('../tests/snapshots/contract.snapshot.json', import.meta.url);
const expected = await readFile(snapshotFile, 'utf8');
const actual = stableJson(await createContractArtifacts());

assertContractSnapshot(expected, actual);
