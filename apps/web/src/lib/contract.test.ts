import { apiContract } from '@minemories/api-contract'
import { describe, expect, it } from 'vitest'

describe('shared oRPC contract', () => {
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
		const valid = [{ id: crypto.randomUUID(), name: 'Capture', size: 0, createdAt: new Date().toISOString() }]
		expect(memories.safeParse(valid).success).toBe(true)
		expect(memories.safeParse([{ ...valid[0], size: -1 }]).success).toBe(false)
		expect(memories.safeParse([{ ...valid[0], id: '../escape' }]).success).toBe(false)
	})
})
