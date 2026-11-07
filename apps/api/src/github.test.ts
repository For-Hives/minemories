import { expect, test } from 'bun:test'
import { githubGet, githubToken } from './github'

test('githubToken trims the variable and treats an empty value as absent', () => {
	expect(githubToken({})).toBeUndefined()
	expect(githubToken({ GITHUB_TOKEN: '   ' })).toBeUndefined()
	expect(githubToken({ GITHUB_TOKEN: ' ghp_example ' })).toBe('ghp_example')
})

test('githubGet sends the API headers, a timeout and the optional token, and reads the next page link', async () => {
	const calls: { url: string; init: RequestInit }[] = []
	const link = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"'
	const fetcher = (url: string, init: RequestInit) => {
		calls.push({ url, init })
		return Promise.resolve(new Response('[1]', { headers: calls.length === 1 ? { link } : {} }))
	}
	expect(await githubGet(fetcher, 'https://api.github.com/x', 'secret')).toEqual({
		body: [1],
		next: 'https://api.github.com/x?page=2',
	})
	expect(await githubGet(fetcher, 'https://api.github.com/x')).toEqual({ body: [1], next: null })
	const [first, second] = calls.map(call => call.init.headers as Record<string, string>)
	expect(first).toEqual({
		Accept: 'application/vnd.github+json',
		'User-Agent': 'minemories-api',
		'X-GitHub-Api-Version': '2022-11-28',
		Authorization: 'Bearer secret',
	})
	expect(second?.Authorization).toBeUndefined()
	expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
})

test('githubGet rejects a non-2xx status', async () => {
	const fetcher = () => Promise.resolve(new Response('{}', { status: 404 }))
	await expect(githubGet(fetcher, 'https://api.github.com/x')).rejects.toThrow('status 404')
})
