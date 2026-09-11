import { loadEnvFile } from 'node:process';

const files = process.env.NODE_ENV === 'test'
  ? ['.env.defaults']
  : ['.env.local', '.env.defaults'];

for (const file of files) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
