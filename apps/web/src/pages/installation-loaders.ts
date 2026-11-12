import type { LoaderTarget } from './mod-releases'

export interface CatalogLink {
	name: string
	url: string
}

/**
 * Where the mod can be installed from inside the CurseForge and Modrinth apps. A catalog without a URL is left
 * out; the guide then falls back to the manual download. Releases are mirrored there by `bun mod sync --remote`.
 * The Modrinth project is not public yet (its API answers 404): its link stays hidden until it is.
 */
export const catalogs: { name: string; url: string | null }[] = [
	{ name: 'CurseForge', url: 'https://www.curseforge.com/minecraft/mc-mods/minemories' },
	{ name: 'Modrinth', url: null },
]
export function catalogLinks(): CatalogLink[] {
	return catalogs.flatMap(catalog => (catalog.url ? [{ name: catalog.name, url: catalog.url }] : []))
}

/** The loader installer to download, or the page that hands it out (Fabric builds its profile for the chosen versions). */
export function installerUrl(target: LoaderTarget): string {
	const { loader, minecraft, loaderVersion: version } = target
	if (loader === 'neoforge')
		return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`
	if (loader === 'forge')
		return `https://maven.minecraftforge.net/net/minecraftforge/forge/${minecraft}-${version}/forge-${minecraft}-${version}-installer.jar`
	return 'https://fabricmc.net/use/installer/'
}
export function fabricApiUrl(target: LoaderTarget): string {
	return `https://modrinth.com/mod/fabric-api/versions?g=${target.minecraft}`
}
/** Temurin, the free official Java build, at the version the target needs (loader installers run with Java). */
export function javaUrl(target: LoaderTarget): string {
	return `https://adoptium.net/temurin/releases/?version=${target.java}`
}
