import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { openAuthorizedCapture } from './capture-downloads'
import { readAll } from './test-support/timelapse-fixture'

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
