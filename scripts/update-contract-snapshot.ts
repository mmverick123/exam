import { mkdir, writeFile } from 'node:fs/promises';

import { createContractArtifacts, stableJson } from './contract-artifacts';

const snapshotFile = new URL('../tests/snapshots/contract.snapshot.json', import.meta.url);
await mkdir(new URL('../tests/snapshots/', import.meta.url), { recursive: true });
await writeFile(snapshotFile, stableJson(await createContractArtifacts()));
