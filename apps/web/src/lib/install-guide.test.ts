import { expect, test } from 'vitest'
import {
	type Answers,
	canContinue,
	chooseMinecraft,
	effectiveTarget,
	type GuideState,
	helpOrder,
	nextStep,
	noAnswers,
	parseGuide,
	presetFromSearch,
	previousStep,
	starterLoader,
	stepPosition,
	stepsFor,
	targetFor,
} from './install-guide'

// A fixture matrix, never mod/targets.json: adding a version there must not break these tests.
const targets = [
	{ minecraft: '2.0', loader: 'fabric', validated: true },
	{ minecraft: '2.0', loader: 'forge', validated: true },
	{ minecraft: '1.0', loader: 'forge', validated: true },
	{ minecraft: '3.0', loader: 'fabric', validated: false },
	{ minecraft: '4.0', loader: 'neoforge', validated: true },
	{ minecraft: '4.0', loader: 'forge', validated: true },
]
const catalogs = ['Shop']
const answers = (value: Partial<Answers>): Answers => ({ ...noAnswers, ...value })
const state = (value: Partial<GuideState>): GuideState => ({
	...noAnswers,
	step: 'version',
	active: true,
	system: 'windows',
	...value,
})

test('the screens follow the answers: own loader, no loader, a catalog app, a preset link, no catalog', () => {
	expect(stepsFor(answers({ loader: 'fabric', way: 'file' }), catalogs)).toEqual([
		'version',
		'loader',
		'way',
		'download',
		'place',
		'check',
		'connect',
		'memory',
	])
	expect(stepsFor(answers({ loader: 'none', way: 'file' }), catalogs)).toHaveLength(9)
	expect(stepsFor(answers({ loader: 'none', way: 'file' }), catalogs)).toContain('loader-install')
	expect(stepsFor(answers({ loader: 'none', way: 'Shop' }), catalogs)).toEqual([
		'version',
		'loader',
		'way',
		'app',
		'check',
		'connect',
		'memory',
	])
	expect(stepsFor(answers({ loader: 'fabric', preset: true, way: 'Shop' }), catalogs)).toEqual([
		'download',
		'place',
		'check',
		'connect',
		'memory',
	])
	// No catalog listed: no way question, the file is the only way. A way not chosen yet counts as the file.
	expect(stepsFor(answers({ loader: 'none', way: 'Shop' }), [])).toEqual([
		'version',
		'loader',
		'loader-install',
		'download',
		'place',
		'check',
		'connect',
		'memory',
	])
	expect(stepsFor(noAnswers, catalogs)).toHaveLength(8)
})

test('the targets: chosen, starter for a player without a loader, none when the pair is not published', () => {
	expect(targetFor(targets, '2.0', 'forge')?.loader).toBe('forge')
	expect(targetFor(targets, '2.0', 'neoforge')).toBeNull()
	expect(starterLoader(targets, '2.0')?.loader).toBe('fabric')
	expect(starterLoader(targets, '4.0')?.loader).toBe('neoforge')
	expect(starterLoader(targets, '9.9')).toBeNull()
	expect(effectiveTarget(targets, answers({ minecraft: '1.0', loader: 'none' }))?.loader).toBe('forge')
	expect(effectiveTarget(targets, answers({ minecraft: '2.0', loader: 'forge' }))?.loader).toBe('forge')
	expect(effectiveTarget(targets, answers({ minecraft: '2.0' }))).toBeNull()
})

test('changing the version keeps a loader it has, keeps “no loader yet” and selects a single loader', () => {
	expect(chooseMinecraft(targets, noAnswers, '2.0')).toEqual(answers({ minecraft: '2.0', loader: '' }))
	expect(chooseMinecraft(targets, answers({ minecraft: '2.0', loader: 'forge', way: 'Shop' }), '4.0')).toEqual(
		answers({ minecraft: '4.0', loader: 'forge', way: 'Shop' })
	)
	expect(chooseMinecraft(targets, answers({ minecraft: '2.0', loader: 'fabric' }), '4.0').loader).toBe('')
	expect(chooseMinecraft(targets, answers({ minecraft: '2.0', loader: 'fabric' }), '1.0').loader).toBe('forge')
	expect(chooseMinecraft(targets, answers({ minecraft: '2.0', loader: 'none' }), '4.0').loader).toBe('none')
})

test('Continue waits for an answer on the question screens only', () => {
	expect(canContinue(targets, 'version', noAnswers)).toBe(false)
	expect(canContinue(targets, 'version', answers({ minecraft: '2.0' }))).toBe(true)
	expect(canContinue(targets, 'loader', answers({ minecraft: '2.0' }))).toBe(false)
	expect(canContinue(targets, 'loader', answers({ minecraft: '2.0', loader: 'none' }))).toBe(true)
	expect(canContinue(targets, 'way', answers({ minecraft: '2.0', loader: 'fabric' }))).toBe(false)
	expect(canContinue(targets, 'way', answers({ way: 'file' }))).toBe(true)
	expect(canContinue(targets, 'download', noAnswers)).toBe(true)
})

test('moving forward and back, with the welcome screen before the first step and success after the last', () => {
	const first = state({ loader: 'fabric', minecraft: '2.0', way: 'file' })
	expect(previousStep(first, catalogs)).toBeNull()
	expect(nextStep(first, catalogs)).toBe('loader')
	expect(stepPosition(first, catalogs)).toEqual({ current: 1, total: 8 })
	expect(previousStep(state({ ...first, step: 'download' }), catalogs)).toBe('way')
	expect(nextStep(state({ ...first, step: 'memory' }), catalogs)).toBe('done')
	expect(nextStep(state({ ...first, step: 'done' }), catalogs)).toBe('done')
	expect(previousStep(state({ ...first, step: 'done' }), catalogs)).toBe('memory')
	expect(stepPosition(state({ ...first, step: 'done' }), catalogs)).toEqual({ current: 8, total: 8 })
	// A screen the answers no longer lead to counts as the first one.
	expect(stepPosition(state({ ...first, step: 'app' }), catalogs)).toEqual({ current: 1, total: 8 })
})

test('a link from the download table names a published pair and skips the questions', () => {
	expect(presetFromSearch(targets, new URLSearchParams('minecraft=2.0&loader=forge&src=downloads'))).toEqual({
		minecraft: '2.0',
		loader: 'forge',
		way: 'file',
		preset: true,
	})
	expect(presetFromSearch(targets, new URLSearchParams('minecraft=2.0&loader=neoforge'))).toBeNull()
	expect(presetFromSearch(targets, new URLSearchParams())).toBeNull()
})

test('a stored guide is checked field by field', () => {
	const saved = state({ minecraft: '2.0', loader: 'fabric', way: 'Shop', step: 'app', system: 'mac' })
	expect(parseGuide(JSON.parse(JSON.stringify(saved)), targets, catalogs, 'windows')).toEqual(saved)
	expect(parseGuide({ ...saved, step: 'done', active: false }, targets, catalogs, 'windows')?.step).toBe('done')
	expect(parseGuide({ ...saved, preset: true, step: 'place' }, targets, catalogs, 'windows')).toMatchObject({
		preset: true,
		step: 'place',
	})
	// Unknown version, loader, way, screen or system: each is dropped on its own.
	expect(
		parseGuide(
			{ minecraft: '9.9', loader: 'fabric', way: 'Gone', step: 'nowhere', system: 'amiga', preset: true },
			targets,
			catalogs,
			'linux'
		)
	).toEqual(state({ active: false, system: 'linux' }))
	expect(
		parseGuide({ minecraft: '2.0', loader: 'quilt', step: 'place', active: true }, targets, catalogs, 'windows')
	).toEqual(state({ minecraft: '2.0', step: 'version' }))
	// An instruction screen needs a version and a loader; a question screen does not.
	expect(
		parseGuide({ minecraft: '9.9', loader: 'fabric', step: 'place', active: true }, targets, catalogs, 'windows')?.step
	).toBe('version')
	expect(parseGuide({ loader: 'fabric', step: 'done', active: true }, targets, catalogs, 'windows')?.step).toBe(
		'version'
	)
	expect(parseGuide({ minecraft: '2.0', step: 'loader', active: true }, targets, catalogs, 'windows')?.step).toBe(
		'loader'
	)
	// "No loader yet" needs a version, and only a published pair can be preset.
	expect(parseGuide({ loader: 'none', preset: true, step: 'download' }, targets, catalogs, 'windows')).toEqual(
		state({ active: false })
	)
	expect(
		parseGuide({ minecraft: '2.0', loader: 'none', preset: true, step: 'download' }, targets, catalogs, 'windows')
	).toMatchObject({ loader: 'none', preset: false })
	expect(
		parseGuide({ minecraft: '1.0', loader: 'none', way: 'file', step: 'loader-install' }, targets, catalogs, 'windows')
	).toEqual(state({ minecraft: '1.0', loader: 'none', way: 'file', step: 'loader-install', active: false }))
	expect(parseGuide({ minecraft: 2, loader: null }, targets, catalogs, 'windows')).toEqual(state({ active: false }))
	// The app screen without its catalog any more: back to the first screen.
	expect(parseGuide(saved, targets, [], 'windows')?.step).toBe('version')
	expect(parseGuide({ ...saved, step: 'nowhere' }, targets, catalogs, 'windows')?.step).toBe('version')
	expect(parseGuide(null, targets, catalogs, 'windows')).toBeNull()
	expect(parseGuide('broken', targets, catalogs, 'windows')).toBeNull()
})

test('the help of a screen comes first, then every other item once', () => {
	const all = ['a', 'b', 'c', 'd'] as const
	const byStep = { place: ['c', 'a'], check: [] } as const
	expect(helpOrder(all, byStep, 'place')).toEqual(['c', 'a', 'b', 'd'])
	expect(helpOrder(all, byStep, 'check')).toEqual(['a', 'b', 'c', 'd'])
	expect(helpOrder(all, byStep, 'version')).toEqual(['a', 'b', 'c', 'd'])
	expect(helpOrder(all, byStep, 'done')).toEqual(['a', 'b', 'c', 'd'])
	expect(helpOrder(all, byStep, null)).toEqual(['a', 'b', 'c', 'd'])
})
