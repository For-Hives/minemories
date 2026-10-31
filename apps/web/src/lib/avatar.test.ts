import { expect, it } from 'vitest'
import { avatarUrl, hashHandle } from './avatar'

it('hashes handles deterministically without leaking the raw value', () => {
	expect(hashHandle('a@b.c')).toBe(hashHandle('a@b.c'))
	expect(hashHandle('a@b.c')).not.toBe(hashHandle('d@e.f'))
	expect(hashHandle('')).toMatch(/^[0-9a-f]{8}$/)
})

it('prefers the account image and otherwise uses a hashed pixel-art CDN URL', () => {
	expect(avatarUrl({ image: 'https://cdn.example/face.png' })).toBe('https://cdn.example/face.png')
	const first = avatarUrl({ id: '1', email: 'a@b.c', name: 'Leo' })
	const second = avatarUrl({ id: '1', email: 'a@b.c', name: 'Leo' })
	expect(first).toBe(second)
	expect(first).toContain('api.dicebear.com/9.x/pixel-art/svg?seed=')
	expect(first).not.toContain('a@b.c')
	expect(avatarUrl({})).toContain('seed=')
})
