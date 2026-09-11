import { loadEnvFile } from 'node:process';

for (const file of ['.env.local', '.env.defaults']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
