import { expect, test, vi } from 'vitest'
import { loadPrerenderedPage, prerenderedChunkPaths } from './App'
import { publicMetadata } from './route-metadata'

vi.mock('./auth-client', () => ({
	authClient: { useSession: () => ({ data: null, isPending: false, refetch: async () => undefined }) },
}))

test('every prerendered page but the landing waits for its chunk before hydrating', () => {
	const prerendered = publicMetadata.map(page => page.path).filter(path => path !== '/')
	expect([...prerenderedChunkPaths].sort()).toEqual([...prerendered].sort())
})

test('the landing and private routes hydrate or render at once', async () => {
	expect(loadPrerenderedPage('/')).toBeUndefined()
	expect(loadPrerenderedPage('/gallery')).toBeUndefined()
	await expect(loadPrerenderedPage('/faq')).resolves.toBeUndefined()
})
