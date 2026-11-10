import { type NotedRelease, releaseHistory } from '../lib/release-notes'

/** The curated notes of every mod release (mod/release-notes), bundled at build time: /versions never waits for the API. */
const files = import.meta.glob<string>('../../../../mod/release-notes/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
})
export const releases: NotedRelease[] = releaseHistory(files)
