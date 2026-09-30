import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.{ts,tsx}'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			thresholds: {
				branches: 100,
				functions: 100,
				lines: 100,
				statements: 100,
			},
		},
	},
})
