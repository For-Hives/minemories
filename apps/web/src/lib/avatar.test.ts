import { expect, it } from 'vitest'
import { avatarUrl } from './avatar'

it('uses the account image and otherwise nothing, so no third-party service is called', () => {
	expect(avatarUrl({ image: 'https://head.sttr.io/face/Notch' })).toBe('https://head.sttr.io/face/Notch')
	expect(avatarUrl({ image: 'https://example.com/photo.png' })).toBe('https://example.com/photo.png')
	expect(avatarUrl({ image: null })).toBeNull()
	expect(avatarUrl({ image: '' })).toBeNull()
	expect(avatarUrl({})).toBeNull()
})

it('serves heads saved with the former service from head.sttr.io', () => {
	expect(avatarUrl({ image: 'https://minotar.net/helm/Light_In/64.png' })).toBe('https://head.sttr.io/face/Light_In')
})
