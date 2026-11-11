import { expect, test, vi } from 'vitest'
import {
	clipFile,
	clipMayPreload,
	clipMode,
	clipShouldPlay,
	clipSide,
	clipSources,
	createClipStage,
} from './hero-clips'

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

test('under the loading screen nothing plays or preloads, even on a link that opens on the site', () => {
	const seen = { mode: 'auto', choice: null, inView: true, pageVisible: true, phase: 'site' } as const
	expect(clipShouldPlay({ ...seen, booting: true })).toBe(false)
	expect(clipShouldPlay({ ...seen, booting: true, choice: 'play' })).toBe(false)
	expect(clipShouldPlay({ ...seen, booting: false })).toBe(true)
	const near = { near: true, mode: 'auto', phase: 'site' } as const
	expect(clipMayPreload(near)).toBe(true)
	expect(clipMayPreload({ ...near, near: false })).toBe(false)
	expect(clipMayPreload({ ...near, mode: 'poster' })).toBe(false)
	expect(clipMayPreload({ ...near, phase: 'film' })).toBe(false)
	expect(clipMayPreload({ ...near, booting: true })).toBe(false)
})

test('only the foremost clip plays by itself; the play button still plays any seen clip', () => {
	const seen = { mode: 'auto', choice: null, inView: true, pageVisible: true, phase: 'site' } as const
	expect(clipShouldPlay({ ...seen, foremost: false })).toBe(false)
	expect(clipShouldPlay({ ...seen, foremost: true })).toBe(true)
	expect(clipShouldPlay({ ...seen, foremost: false, choice: 'play' })).toBe(true)
})

test('a cut clip is on its first side before the cut and on the second from it', () => {
	expect(clipSide(0, 2.5)).toBe('before')
	expect(clipSide(2.49, 2.5)).toBe('before')
	expect(clipSide(2.5, 2.5)).toBe('after')
	expect(clipSide(5, 2.5)).toBe('after')
})

test('the stage picks the most visible clip at or above the seen ratio, the first one on a tie, and tells only on a change', () => {
	const stage = createClipStage(0.35)
	const changed = vi.fn()
	const stop = stage.subscribe(changed)
	const a = stage.add()
	const b = stage.add()
	expect(stage.foremost()).toBeNull()
	stage.report(a, 0.2)
	expect(stage.foremost()).toBeNull()
	expect(changed).not.toHaveBeenCalled()
	stage.report(a, 0.35)
	expect(stage.foremost()).toBe(a)
	stage.report(b, 0.35)
	expect(stage.foremost()).toBe(a)
	expect(changed).toHaveBeenCalledTimes(1)
	stage.report(b, 0.9)
	expect(stage.foremost()).toBe(b)
	stage.remove(b)
	expect(stage.foremost()).toBe(a)
	expect(changed).toHaveBeenCalledTimes(3)
	stop()
	stage.report(a, 0)
	expect(stage.foremost()).toBeNull()
	expect(changed).toHaveBeenCalledTimes(3)
})
