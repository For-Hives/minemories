import { expect, test } from 'vitest'
import { emptyPreferences, parseDemoPreferences, toggleId } from './demo-preferences'

test('only known demo IDs restore, without duplicate votes or arbitrary user data', () => {
	expect(
		parseDemoPreferences('{"favorites":["premiere-maison","premiere-maison","private-id",3],"votes":["jardin-secret"]}')
	).toEqual({ favorites: ['premiere-maison'], votes: ['jardin-secret'] })
	for (const raw of [null, '{broken', 'null', '[]', '{"votes":true,"favorites":{}}'])
		expect(parseDemoPreferences(raw)).toEqual(emptyPreferences)
})
test('local votes and favorites toggle reversibly without mutating the previous state', () => {
	const original = ['premiere-maison']
	expect(toggleId(original, 'jardin-secret')).toEqual(['premiere-maison', 'jardin-secret'])
	expect(toggleId(original, 'premiere-maison')).toEqual([])
	expect(original).toEqual(['premiere-maison'])
})
