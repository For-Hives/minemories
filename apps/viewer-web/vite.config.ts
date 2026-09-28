import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '0.0.0.0' },
  build: {
    // Three.js and GLTFLoader currently produce ~588 kB minified / ~149 kB gzip.
    chunkSizeWarningLimit: 650,
  },
});
