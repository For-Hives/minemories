import { expect, it } from 'vitest'
import { avatarUrl } from './avatar'

it('uses the account image and otherwise nothing, so no third-party service is called', () => {
	expect(avatarUrl({ image: 'https://minotar.net/helm/Notch/64.png' })).toBe('https://minotar.net/helm/Notch/64.png')
	expect(avatarUrl({ image: null })).toBeNull()
	expect(avatarUrl({ image: '' })).toBeNull()
	expect(avatarUrl({})).toBeNull()
})
