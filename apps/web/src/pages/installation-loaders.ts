import type { LoaderTarget } from './mod-releases'

export interface CatalogLink {
	name: string
	url: string
}

/**
 * Where the mod can be installed from inside the CurseForge and Modrinth apps. A catalog without a URL is left
 * out; the guide then falls back to the manual download. Releases are mirrored there by `bun mod sync --remote`.
 */
export const catalogs: { name: string; url: string | null }[] = [
	{ name: 'CurseForge', url: 'https://www.curseforge.com/minecraft/mc-mods/minemories' },
	{ name: 'Modrinth', url: 'https://modrinth.com/mod/minemories-3d' },
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
