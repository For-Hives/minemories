import { expect, test } from 'vitest'
import { clipFile, clipMode, clipShouldPlay, clipSources } from './hero-clips'

const menu = { fr: 'menu-fr', en: 'menu-en' }

test('a clip with in-game text plays its French take in French and Canadian French, the English one elsewhere', () => {
	expect(clipFile(menu, 'fr')).toBe('menu-fr')
	expect(clipFile(menu, 'fr-CA')).toBe('menu-fr')
	for (const lang of ['en', 'en-GB', 'de', 'ja', 'pt-BR', '']) expect(clipFile(menu, lang), lang).toBe('menu-en')
	expect(clipFile('walk', 'fr')).toBe('walk')
	expect(clipSources(menu, 'fr-CA')).toEqual({ video: '/hero/clips/menu-fr.mp4', poster: '/hero/clips/menu-fr.webp' })
	expect(clipSources('walk', 'de')).toEqual({ video: '/hero/clips/walk.mp4', poster: '/hero/clips/walk.webp' })
})

test('reduced motion, the site’s motion option, Save-Data and slow connections keep the poster', () => {
	expect(clipMode({ reducedMotion: false })).toBe('auto')
	expect(clipMode({ reducedMotion: false, motionOption: 'full', saveData: false, effectiveType: '4g' })).toBe('auto')
	expect(clipMode({ reducedMotion: true })).toBe('poster')
	expect(clipMode({ reducedMotion: false, motionOption: 'reduced' })).toBe('poster')
	expect(clipMode({ reducedMotion: false, saveData: true })).toBe('poster')
	for (const effectiveType of ['slow-2g', '2g', '3g'])
		expect(clipMode({ reducedMotion: false, effectiveType }), effectiveType).toBe('poster')
})

test('a clip plays only on screen, in a visible tab, after the film, and as the visitor’s settings or choice say', () => {
	const seen = { mode: 'auto', choice: null, inView: true, pageVisible: true, phase: 'site' } as const
	expect(clipShouldPlay(seen)).toBe(true)
	expect(clipShouldPlay({ ...seen, phase: undefined })).toBe(true)
	expect(clipShouldPlay({ ...seen, inView: false })).toBe(false)
	expect(clipShouldPlay({ ...seen, pageVisible: false })).toBe(false)
	expect(clipShouldPlay({ ...seen, phase: 'film' })).toBe(false)
	expect(clipShouldPlay({ ...seen, phase: 'glide' })).toBe(false)
	expect(clipShouldPlay({ ...seen, mode: 'poster' })).toBe(false)
	// the button wins over the settings, but never plays an unseen clip
	expect(clipShouldPlay({ ...seen, mode: 'poster', choice: 'play' })).toBe(true)
	expect(clipShouldPlay({ ...seen, choice: 'pause' })).toBe(false)
	expect(clipShouldPlay({ ...seen, mode: 'poster', choice: 'play', inView: false })).toBe(false)
})
