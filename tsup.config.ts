import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    contract: 'src/contract/index.ts',
    renderer: 'src/renderer/index.ts',
    designer: 'src/designer/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', '@dnd-kit/core', 'dompurify', 'zustand'],
});
