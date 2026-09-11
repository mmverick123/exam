import { mkdir, writeFile } from 'node:fs/promises';

import { createContractArtifacts, stableJson } from './contract-artifacts';

const artifacts = await createContractArtifacts();
const outputDirectory = new URL('../contract/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  writeFile(new URL('widgets.json', outputDirectory), stableJson(artifacts.widgets)),
  writeFile(new URL('schema.json', outputDirectory), stableJson(artifacts.schema)),
  writeFile(new URL('version.json', outputDirectory), stableJson(artifacts.version)),
]);
