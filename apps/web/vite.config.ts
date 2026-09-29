import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [tailwindcss()],
	server: { host: '0.0.0.0' },
	build: {
		// Three.js and GLTFLoader currently produce ~588 kB minified / ~149 kB gzip.
		chunkSizeWarningLimit: 650,
		rolldownOptions: {
			input: {
				app: resolve(root, 'index.html'),
				viewer: resolve(root, 'viewer.html'),
			},
		},
	},
})
