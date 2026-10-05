import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'unit', include: ['test/*.test.ts'] } },
			// Starts a real Directus; needs `npm run build` first.
			{ test: { name: 'integration', include: ['test/integration/*.test.ts'], testTimeout: 60_000, hookTimeout: 120_000 } },
		],
	},
});
