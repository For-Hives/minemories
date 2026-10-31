/**
 * Local development seed: a dev account plus real captures from ~/export/history, including an evolving series.
 * Usage: bun api:seed [exportDir]   (API must be running on localhost)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

const API = process.env.SEED_API_URL ?? 'http://localhost:3001'
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
const DEV_EMAIL = 'dev@minemories.local'
const DEV_PASSWORD = 'minemories-dev-password'
const MAX_FRAME_BYTES = 12 * 1024 * 1024
const EVOLUTION_DAY_TICKS = [1000, 6000, 9000, 12500, 13500, 18000, 23000, 3000]
const DAY_MS = 86_400_000

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error('The seed only targets a local API')

interface Capture {
	glb: Buffer
	metadata: Record<string, unknown>
}

function loadCaptures(root: string): Capture[] {
	return readdirSync(root)
		.sort()
		.flatMap(folder => {
			try {
				const glb = readFileSync(join(root, folder, 'capture.glb'))
				const metadata = JSON.parse(readFileSync(join(root, folder, 'capture.json'), 'utf8')) as Record<string, unknown>
				return glb.byteLength <= MAX_FRAME_BYTES && metadata.worldId && metadata.zoneId ? [{ glb, metadata }] : []
			} catch {
				return []
			}
		})
}

const zone = (capture: Capture) =>
	`${capture.metadata.worldId}/${capture.metadata.zoneId}/${capture.metadata.dimension}`

async function signedInCookie(): Promise<string> {
	const headers = { 'content-type': 'application/json', origin: WEB_ORIGIN }
	const credentials = JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD, name: 'Dev' })
	let response = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers, body: credentials })
	if (!response.ok)
		response = await fetch(`${API}/api/auth/sign-in/email`, { method: 'POST', headers, body: credentials })
	if (!response.ok) throw new Error(`Authentication failed (${response.status})`)
	return response.headers
		.getSetCookie()
		.map(cookie => cookie.split(';')[0])
		.join('; ')
}

async function deviceToken(cookie: string): Promise<string> {
	const client: ContractRouterClient<typeof apiContract> = createORPCClient(
		new RPCLink({ url: `${API}/rpc`, headers: { cookie, origin: WEB_ORIGIN } })
	)
	const { code } = await client.pairing.create()
	const response = await fetch(`${API}/api/mod/pair`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code, name: 'Dev seed' }),
	})
	if (!response.ok) throw new Error(`Pairing failed (${response.status})`)
	return ((await response.json()) as { deviceToken: string }).deviceToken
}

async function upload(token: string, name: string, capture: Capture, overrides: Record<string, unknown> = {}) {
	const metadata = { ...capture.metadata, ...overrides }
	const send = (body: Record<string, unknown>) =>
		fetch(`${API}/api/mod/memories`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'model/gltf-binary',
				'x-memory-name': name,
				'x-memory-metadata': Buffer.from(JSON.stringify(body)).toString('base64url'),
			},
			body: capture.glb,
		})
	let response = await send(metadata)
	if (response.status === 400) response = await send({ ...metadata, thumbnail: null, icon: null })
	if (!response.ok) throw new Error(`Upload of ${name} failed (${response.status})`)
	console.log(`  ${name} · ${(capture.glb.byteLength / 1e6).toFixed(1)} MB`)
}

const root = process.argv[2] ?? join(homedir(), 'export', 'history')
const captures = loadCaptures(root)
if (captures.length === 0) throw new Error(`No usable captures in ${root}`)
const byZone = Map.groupBy(captures, zone)
const real = [...byZone.values()].filter(group => group.length > 1).flat()
const singles = [...byZone.values()].filter(group => group.length === 1).flat()
const smallest = [...captures].sort((a, b) => a.glb.byteLength - b.glb.byteLength).slice(0, 3)
const [anchor] = smallest
if (!anchor) throw new Error('No capture to evolve')
const base = Date.parse(String(anchor.metadata.capturedAt))
const { worldId, zoneId, captureBounds, captureOrigin, captureMode, worldScope, dimension } = anchor.metadata
const identity = { worldId, zoneId, captureBounds, captureOrigin, captureMode, worldScope, dimension }

const token = await deviceToken(await signedInCookie())
console.log(`Seeding ${DEV_EMAIL}`)
const jobs = [
	...real.map(capture => () => upload(token, 'Village (captures réelles)', capture)),
	...EVOLUTION_DAY_TICKS.map((dayTime, index) => () => {
		const at = new Date(base + (index + 1) * DAY_MS).toISOString()
		const overrides = {
			...identity,
			capturedAt: at,
			captureStartedAt: at,
			captureFinishedAt: at,
			dayTime,
			worldName: 'Évolution (dev)',
		}
		return upload(token, 'Évolution (dev)', smallest[index % smallest.length] ?? anchor, overrides)
	}),
	...singles.slice(0, 3).map(capture => () => upload(token, 'Capture isolée', capture)),
]
for (const job of jobs) {
	// biome-ignore lint/performance/noAwaitInLoops: the API accepts at most two staged uploads per device.
	await job()
}
console.log(`Done. Sign in at ${WEB_ORIGIN} as ${DEV_EMAIL} (password: see apps/api/scripts/seed-dev.ts).`)
