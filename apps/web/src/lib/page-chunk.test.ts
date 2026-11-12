import { expect, test, vi } from 'vitest'
import { lazyExport, pageChunk } from './page-chunk'

test('a chunk downloads once and remembers its module', async () => {
	const importer = vi.fn(async () => ({ Page: 'faq' }))
	const chunk = pageChunk(importer)
	expect(chunk.loaded()).toBeUndefined()
	const [first, second] = await Promise.all([chunk.load(), chunk.load()])
	expect(first).toBe(second)
	expect(chunk.loaded()).toEqual({ Page: 'faq' })
	await chunk.load()
	expect(importer).toHaveBeenCalledTimes(1)
})

test('a failed download is tried again on the next load', async () => {
	const importer = vi
		.fn<() => Promise<{ Page: string }>>()
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce({ Page: 'faq' })
	const chunk = pageChunk(importer)
	await expect(chunk.load()).rejects.toThrow('offline')
	expect(chunk.loaded()).toBeUndefined()
	await expect(chunk.load()).resolves.toEqual({ Page: 'faq' })
	expect(importer).toHaveBeenCalledTimes(2)
})

test('before the chunk arrives, the lazy loader waits for it', async () => {
	const chunk = pageChunk(async () => ({ Page: 'faq' }))
	const load = lazyExport(chunk, module => module.Page)
	await expect(load()).resolves.toEqual({ default: 'faq' })
})

test('once the chunk is loaded, the lazy loader answers in the same tick', async () => {
	const chunk = pageChunk(async () => ({ Page: 'faq' }))
	await chunk.load()
	const seen: unknown[] = []
	const thenable = lazyExport(chunk, module => module.Page)()
	expect(thenable.then(value => seen.push(value))).toBe(thenable)
	expect(seen).toEqual([{ default: 'faq' }])
})
