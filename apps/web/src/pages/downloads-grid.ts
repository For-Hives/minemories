import {
	javaFor,
	type LoaderDownload,
	type LoaderTarget,
	listedMinecraft,
	loaderTargets,
	type ModRelease,
} from './mod-releases'

/** Column order of the download table. */
const loaderOrder = ['neoforge', 'fabric', 'forge']

export interface GridCell {
	loader: string
	/** The published target for this version and loader; null when no JAR is built for the pair at all. */
	target: LoaderTarget | null
	/** The newest release carrying this target, with its JAR; null while nothing is published for the pair. */
	release: ModRelease | null
	download: LoaderDownload | null
}
export interface GridRow {
	minecraft: string
	/** The Java version the JARs of this Minecraft version need. */
	java: string
	cells: GridCell[]
}
export interface DownloadGrid {
	loaders: { loader: string; name: string }[]
	rows: GridRow[]
}

/**
 * The Minecraft version x loader table, newest version first and the experimental ones last: each cell holds the newest
 * published JAR of its target.
 * `releases` come newest first from the API index, so the first release with a download for a pair is the latest one.
 */
export function downloadGrid(releases: ModRelease[], targets: LoaderTarget[] = loaderTargets): DownloadGrid {
	const loaders = loaderOrder
		.filter(loader => targets.some(target => target.loader === loader))
		.map(loader => ({ loader, name: targets.find(target => target.loader === loader)?.name ?? loader }))
	const rows = listedMinecraft(targets).map(minecraft => ({
		minecraft,
		java: javaFor(minecraft, targets) as string,
		cells: loaders.map(({ loader }) => {
			const target = targets.find(item => item.minecraft === minecraft && item.loader === loader) ?? null
			const release = target ? releases.find(item => findDownload(item, target)) : undefined
			return {
				loader,
				target,
				release: release ?? null,
				download: release && target ? findDownload(release, target) : null,
			}
		}),
	}))
	return { loaders, rows }
}
function findDownload(release: ModRelease, target: LoaderTarget): LoaderDownload | null {
	return release.downloads.find(download => download.target.id === target.id) ?? null
}
