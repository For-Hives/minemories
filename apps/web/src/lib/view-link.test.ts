import { expect, it } from 'vitest'
import { readViewLink, VIEW_KEYS, viewParams, withViewLink } from './view-link'

const read = (query: string) => readViewLink(new URLSearchParams(query))

it('reads a full view: camera, target, hour, weather, lighting, hidden layers and snapshot', () => {
	expect(
		read('cam=12.5,70,-3&at=0,64.25,1&time=17:05&weather=rain&light=faithful&hide=entities,fluids&snap=abc-1_Z')
	).toEqual({
		camera: [12.5, 70, -3],
		target: [0, 64.25, 1],
		minutes: 1025,
		weather: 'rain',
		lighting: 'faithful',
		hidden: ['fluids', 'entities'],
		snapshot: 'abc-1_Z',
	})
	expect(read('')).toEqual({})
})

it('leaves out every field it cannot trust', () => {
	expect(read('cam=1,2,3')).toEqual({})
	expect(read('cam=1,2&at=1,2,3')).toEqual({})
	expect(read('cam=1,,3&at=1,2,3')).toEqual({})
	expect(read('cam=1,2,NaN&at=1,2,3')).toEqual({})
	expect(read('cam=1,2,1e12&at=1,2,3')).toEqual({})
	expect(read('time=24:00')).toEqual({})
	expect(read('time=12:60')).toEqual({})
	expect(read('time=noon')).toEqual({})
	expect(read('weather=hail&light=neon')).toEqual({})
	expect(read('hide=terrain,../etc,entities')).toEqual({ hidden: ['terrain', 'entities'] })
	expect(read('hide=')).toEqual({ hidden: [] })
	expect(read('snap=../../admin')).toEqual({})
	expect(read(`snap=${'a'.repeat(129)}`)).toEqual({})
	expect(read('time=7:30')).toEqual({ minutes: 450 })
})

it('writes a view rounded to the centimetre and the minute, and only what it has', () => {
	const params = viewParams({
		camera: [1.234_56, -2, 3.005],
		target: [0, 0.5, 0],
		minutes: 1439.6,
		weather: 'snow',
		lighting: 'realistic',
		hidden: ['decor'],
		snapshot: 'm1',
	})
	expect(Object.fromEntries(params)).toEqual({
		cam: '1.23,-2,3.01',
		at: '0,0.5,0',
		time: '00:00',
		weather: 'snow',
		light: 'realistic',
		hide: 'decor',
		snap: 'm1',
	})
	expect(viewParams({ camera: [1, 2, 3], hidden: [] }).toString()).toBe('')
	expect(viewParams({ minutes: -30 }).get('time')).toBe('23:30')
})

it('round-trips through a link, replacing an older view and keeping other parameters', () => {
	const view = { camera: [5, 6, 7] as const, target: [1, 2, 3] as const, minutes: 615, weather: 'mist' as const }
	const link = withViewLink('https://example.test/share/tok?review=1&time=01:00&hide=terrain', view)
	expect(link).toBe('https://example.test/share/tok?review=1&cam=5,6,7&at=1,2,3&time=10:15&weather=mist')
	expect(readViewLink(new URL(link).searchParams)).toEqual(view)
	expect(withViewLink('https://example.test/share/tok', {})).toBe('https://example.test/share/tok')
	expect(VIEW_KEYS).toContain('snap')
})
