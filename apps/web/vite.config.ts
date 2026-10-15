import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { publicMetadata } from './src/route-metadata.ts'

const privatePath = /^\/(?:gallery|viewer|share|public|moderation|login|register)(?:\/|$)/
const trailingSlash = /\/$/
function publicFile(path: string) {
	return path === '/' ? 'index.html' : `.${path}/index.html`
}
function staticRouting(): Plugin {
	return {
		name: 'minemories-static-routing',
		configurePreviewServer(server) {
			server.middlewares.use((request, response, next) => {
				const path = new URL(request.url ?? '/', 'http://localhost').pathname.replace(trailingSlash, '') || '/'
				const privatePage = privatePath.test(path)
				const publicPage = publicMetadata.find(page => page.path === path)
				if (!privatePage && path.includes('.')) return next()
				let file = '404.html'
				if (privatePage) file = 'app.html'
				else if (publicPage) file = publicFile(path)
				void readFile(resolve(server.config.root, server.config.build.outDir, file))
					.then(html => {
						response.statusCode = privatePage || publicPage ? 200 : 404
						response.setHeader('Content-Type', 'text/html; charset=utf-8')
						if (!(publicPage && html.includes('name="robots" content="index,follow"')))
							response.setHeader('X-Robots-Tag', 'noindex,nofollow')
						response.end(html)
					})
					.catch(next)
			})
		},
	}
}
export default defineConfig({
	plugins: [tailwindcss(), staticRouting()],
	server: { host: '0.0.0.0' },
	build: { chunkSizeWarningLimit: 650 },
})
