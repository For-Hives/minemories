import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [tailwindcss()],
	server: { host: '0.0.0.0' },
	build: {
		// Three.js and GLTFLoader currently produce ~588 kB minified / ~149 kB gzip.
		chunkSizeWarningLimit: 650,
	},
})
