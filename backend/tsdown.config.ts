import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: { index: 'src/index.ts', migrate: 'src/db/migrate.ts' },
	platform: 'node',
	format: 'esm',
	fixedExtension: false,
});
