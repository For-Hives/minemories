import type { LoaderTarget } from './mod-releases'

export interface CatalogLink {
	name: string
	url: string
}

/**
 * Where the mod can be installed from inside the CurseForge and Modrinth apps. Both stay empty until the
 * catalog pages exist: the guide then sends everyone to the manual download.
 */
const catalogs: { name: string; url: string | null }[] = [
	{ name: 'CurseForge', url: null },
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
export function guideUrl(target: LoaderTarget): string {
	if (target.loader === 'neoforge') return 'https://docs.neoforged.net/user/docs/'
	if (target.loader === 'forge') return 'https://docs.minecraftforge.net/en/latest/gettingstarted/'
	return 'https://wiki.fabricmc.net/player:tutorials:install_mcl:windows'
}
export function fabricApiUrl(target: LoaderTarget): string {
	return `https://modrinth.com/mod/fabric-api/versions?g=${target.minecraft}`
}
export function javaUrl(target: LoaderTarget): string {
	return `https://adoptium.net/temurin/releases/?version=${target.java}`
}
