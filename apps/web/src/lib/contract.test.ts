import { apiContract } from '@minemories/api-contract'
import { describe, expect, it } from 'vitest'

describe('shared oRPC contract', () => {
	it('declares private account storage with finite whole-byte quantities', () => {
		const output = apiContract.account.storage['~orpc'].outputSchema
		if (!output) throw new Error('Storage response schema is required')
		const valid = { usedBytes: 10, limitBytes: 100, availableBytes: 90, reservedBytes: 2, pendingDeletionBytes: 3 }
		expect(output.safeParse(valid).success).toBe(true)
		expect(output.safeParse({ ...valid, usedBytes: 200, availableBytes: 0 }).success).toBe(true)
		for (const field of Object.keys(valid)) {
			for (const value of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
				expect(output.safeParse({ ...valid, [field]: value }).success).toBe(false)
			}
		}
		expect(output.safeParse({ ...valid, limitBytes: 0 }).success).toBe(false)
	})
	it('only accepts six digit pairing codes and declared statuses', () => {
		const check = apiContract.pairing.check['~orpc']
		const input = check.inputSchema
		const output = check.outputSchema
		if (!(input && output)) throw new Error('Pairing contract schemas are required')
		expect(input.safeParse({ code: '000000' }).success).toBe(true)
		for (const code of ['', '12345', '1234567', '１２３４５６', '12345a']) {
			expect(input.safeParse({ code }).success).toBe(false)
		}
		for (const status of ['pending', 'paired', 'expired']) {
			expect(output.safeParse({ status }).success).toBe(true)
		}
		expect(output.safeParse({ status: 'unknown' }).success).toBe(false)
	})

	it('rejects malformed API output before the UI can consume it', () => {
		const created = apiContract.pairing.create['~orpc'].outputSchema
		if (!created) throw new Error('Pairing response schema is required')
		expect(created.safeParse({ code: '123456', expiresAt: new Date().toISOString() }).success).toBe(true)
		expect(created.safeParse({ code: '123456', expiresAt: 'tomorrow' }).success).toBe(false)

		const memories = apiContract.memories.list['~orpc'].outputSchema
		if (!memories) throw new Error('Memories response schema is required')
		const valid = [
			{
				id: crypto.randomUUID(),
				name: 'Capture',
				size: 0,
				createdAt: new Date().toISOString(),
				metadata: {
					seed: null,
					x: null,
					y: null,
					z: null,
					dimension: null,
					worldName: null,
					serverName: null,
					biome: null,
					dayTime: null,
					raining: null,
					thundering: null,
					thumbnail: null,
					icon: null,
					capturedAt: null,
				},
			},
		]
		expect(memories.safeParse(valid).success).toBe(true)
		expect(memories.safeParse([{ ...valid[0], size: -1 }]).success).toBe(false)
		expect(memories.safeParse([{ ...valid[0], id: '../escape' }]).success).toBe(false)
	})

	it('reports whether the account already trusts a device', () => {
		const status = apiContract.pairing.status['~orpc'].outputSchema
		if (!status) throw new Error('Pairing status schema is required')
		expect(status.safeParse({ paired: true }).success).toBe(true)
		expect(status.safeParse({ paired: false }).success).toBe(true)
		expect(status.safeParse({ paired: 'yes' }).success).toBe(false)
	})

	it('accepts model-rendered thumbnails for saved memories', () => {
		const endpoint = apiContract.memories.setThumbnail['~orpc']
		const input = endpoint.inputSchema
		const output = endpoint.outputSchema
		if (!(input && output)) throw new Error('Thumbnail schemas are required')
		const id = crypto.randomUUID()
		const jpeg = `data:image/jpeg;base64,${'A'.repeat(64)}`
		const png = `data:image/png;base64,${'A'.repeat(64)}`
		expect(input.safeParse({ id, thumbnail: jpeg }).success).toBe(true)
		expect(input.safeParse({ id, thumbnail: png }).success).toBe(true)
		expect(input.safeParse({ id, thumbnail: jpeg, icon: png }).success).toBe(true)
		expect(input.safeParse({ id, thumbnail: jpeg, icon: 'data:image/gif;base64,AAAA' }).success).toBe(false)
		expect(input.safeParse({ id: '../escape', thumbnail: jpeg }).success).toBe(false)
		expect(input.safeParse({ id, thumbnail: 'data:image/gif;base64,AAAA' }).success).toBe(false)
		expect(input.safeParse({ id, thumbnail: `data:image/jpeg;base64,${'A'.repeat(96_001)}` }).success).toBe(false)
		expect(output.safeParse({ ok: true }).success).toBe(true)
		expect(output.safeParse({ ok: false }).success).toBe(false)
	})

	it('declares trash, rename and sharing operations', () => {
		const memories = apiContract.memories
		const id = crypto.randomUUID()
		const metadata = {
			seed: null,
			x: null,
			y: null,
			z: null,
			dimension: null,
			worldName: null,
			serverName: null,
			biome: null,
			dayTime: null,
			raining: null,
			thundering: null,
			thumbnail: null,
			icon: null,
			capturedAt: null,
		}
		const base = { id, name: 'Cabin', size: 10, createdAt: new Date().toISOString(), metadata }

		const trashOutput = memories.listTrash['~orpc'].outputSchema
		if (!trashOutput) throw new Error('Trash response schema is required')
		expect(trashOutput.safeParse([{ ...base, deletedAt: new Date().toISOString() }]).success).toBe(true)
		expect(trashOutput.safeParse([base]).success).toBe(false)

		const renameInput = memories.rename['~orpc'].inputSchema
		if (!renameInput) throw new Error('Rename input schema is required')
		expect(renameInput.safeParse({ id, name: 'Cabin above the ravine' }).success).toBe(true)
		expect(renameInput.safeParse({ id, name: '   ' }).success).toBe(false)
		expect(renameInput.safeParse({ id, name: 'x'.repeat(81) }).success).toBe(false)
		expect(renameInput.safeParse({ id: 'nope', name: 'Cabin' }).success).toBe(false)

		for (const endpoint of [memories.trash, memories.restore, memories.delete]) {
			const schema = endpoint['~orpc'].inputSchema
			if (!schema) throw new Error('Memory input schema is required')
			expect(schema.safeParse({ id }).success).toBe(true)
			expect(schema.safeParse({ id: 'nope' }).success).toBe(false)
		}

		const shareOutput = memories.createShare['~orpc'].outputSchema
		if (!shareOutput) throw new Error('Share response schema is required')
		expect(shareOutput.safeParse({ token: 'A'.repeat(43), urlPath: '/share/abc' }).success).toBe(true)
		expect(shareOutput.safeParse({ token: 'short', urlPath: '/share/abc' }).success).toBe(false)

		const revokeInput = memories.revokeShare['~orpc'].inputSchema
		if (!revokeInput) throw new Error('Revoke input schema is required')
		expect(revokeInput.safeParse({ id }).success).toBe(true)

		const shareState = memories.shareStatus['~orpc'].outputSchema
		if (!shareState) throw new Error('Share status schema is required')
		expect(shareState.safeParse({ shared: true }).success).toBe(true)
		expect(shareState.safeParse({ shared: false }).success).toBe(true)
		expect(shareState.safeParse({ shared: 'yes' }).success).toBe(false)
	})
})
