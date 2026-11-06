import type { ModIndex } from '@minemories/api-contract'

const digest: Record<string, string> = { neoforge: 'a', fabric: 'b', forge: 'c' }
const targets: Record<
	string,
	{ loader: string; minecraft: string; loaderVersion: string; java: string; fabricApi?: string }
> = {
	'neoforge-mc1.21.1': { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.248', java: '21' },
	'fabric-mc1.21.1': {
		loader: 'fabric',
		minecraft: '1.21.1',
		loaderVersion: '0.19.5',
		java: '21',
		fabricApi: '0.116.17+1.21.1',
	},
	'forge-mc1.21.1': { loader: 'forge', minecraft: '1.21.1', loaderVersion: '52.1.19', java: '21' },
	'fabric-mc1.19.2': {
		loader: 'fabric',
		minecraft: '1.19.2',
		loaderVersion: '0.20.1',
		java: '17',
		fabricApi: '0.77.0+1.19.2',
	},
}

export interface FixtureVersion {
	version: string
	builtAt?: string
	commit?: string
	bytes?: number
}

/** Builds an `index.json` as served by `GET /downloads/index.json`, from `{ targetId: versions }`. */
export function modIndexFixture(published: Record<string, (string | FixtureVersion)[]>): ModIndex {
	return {
		schema: 1,
		generatedAt: '2026-10-20T10:00:00Z',
		targets: Object.fromEntries(
			Object.entries(published).map(([id, versions]) => {
				const entries = versions.map(item => (typeof item === 'string' ? { version: item } : item))
				const info = targets[id] ?? { loader: 'other', minecraft: '1.0', loaderVersion: '1', java: '21' }
				return [
					id,
					{
						...info,
						latest: entries[0]?.version ?? '0.0.0',
						versions: entries.map((entry, index) => ({
							version: entry.version,
							builtAt: entry.builtAt ?? `2026-10-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
							commit: entry.commit ?? 'abc1234',
							bytes: entry.bytes ?? 300220,
							sha256: (digest[info.loader] ?? 'd').repeat(64),
							key: `mods/${id}/${entry.version}/minemories-${id}-${entry.version}.jar`,
						})),
					},
				]
			})
		),
	}
}
