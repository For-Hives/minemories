import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { openAuthorizedCapture } from './capture-downloads'
import { readAll } from './test-support/timelapse-fixture'

test('opening callback counts first delivered bytes once, never empty, failed or abandoned streams', async () => {
	let count = 0
	const signal = new AbortController().signal
	const open = async (source: Readable, selectedSignal = signal) => {
		const result = await openAuthorizedCapture(
			{ read: async () => source },
			() => 'key',
			selectedSignal,
			() => count++
		)
		if (!result) throw new Error('Missing capture')
		return result
	}
	const body = await open(Readable.from([Buffer.alloc(0), Buffer.from('gl'), Buffer.from('TF')]))
	expect(count).toBe(0)
	expect((await readAll(body)).toString()).toBe('glTF')
	expect(count).toBe(1)
	await readAll(await open(Readable.from([])))
	expect(count).toBe(1)
	const abandoned = Readable.from([Buffer.from('secret')])
	const unused = await open(abandoned)
	unused.destroy()
	await new Promise(resolve => unused.once('close', resolve))
	expect(abandoned.destroyed).toBe(true)
	expect(count).toBe(1)
	const failed = await open(
		new Readable({
			read() {
				this.destroy(new Error('storage offline'))
			},
		})
	)
	await expect(readAll(failed)).rejects.toThrow('storage offline')
	expect(count).toBe(1)
	const controller = new AbortController()
	const cancelled = await open(Readable.from([Buffer.from('secret')]), controller.signal)
	controller.abort()
	await expect(readAll(cancelled)).rejects.toThrow()
	expect(count).toBe(1)
})

test('downloads open only authorized captures and recheck after asynchronous storage', async () => {
	let key: string | null = null,
		opens = 0
	const body = Readable.from([Buffer.from('glTF')]),
		files = {
			read: async () => {
				opens++
				return body
			},
		}
	const signal = new AbortController().signal
	expect(await openAuthorizedCapture(files, () => key, signal)).toBeNull()
	expect(opens).toBe(0)
	key = 'available'
	const result = await openAuthorizedCapture(files, () => key, signal)
	if (!result) throw new Error('Missing authorized body')
	expect((await readAll(result)).toString()).toBe('glTF')
	const revoked = Readable.from([Buffer.from('secret')])
	expect(
		await openAuthorizedCapture(
			{
				read: async () => {
					key = null
					return revoked
				},
			},
			() => key,
			signal
		)
	).toBeNull()
	expect(revoked.destroyed).toBe(true)
})

test('an original removed by conversion retries the new key once, while revocation and real storage errors win', async () => {
	const signal = new AbortController().signal
	let key: string | null = 'original',
		reads = 0
	const files = {
		read: async () => {
			reads++
			if (reads === 1) {
				key = 'manifest'
				throw new Error('old object removed')
			}
			return Readable.from([Buffer.from('new capture')])
		},
	}
	const result = await openAuthorizedCapture(files, () => key, signal)
	if (!result) throw new Error('Missing converted body')
	expect((await readAll(result)).toString()).toBe('new capture')
	expect(reads).toBe(2)
	await expect(
		openAuthorizedCapture(
			{
				read: async () => {
					throw new Error('offline')
				},
			},
			() => key,
			signal
		)
	).rejects.toThrow('offline')
	key = 'original'
	expect(
		await openAuthorizedCapture(
			{
				read: async () => {
					key = null
					throw new Error('removed')
				},
			},
			() => key,
			signal
		)
	).toBeNull()
})
