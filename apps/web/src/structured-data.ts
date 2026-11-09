import gradleProperties from '../../../mod/1.21.1/gradle.properties?raw'
import { repositoryUrl } from './lib/roadmap'
import { catalogLinks } from './pages/installation-loaders'
import { type PageMetadata, siteOrigin } from './route-metadata'

const modVersionPattern = /^mod_version=(.+)$/m
/** The mod version this site is built with (`mod_version` in mod/1.21.1/gradle.properties, bumped by `bun mod version bump`). */
export function modVersionFrom(properties: string): string | undefined {
	return modVersionPattern.exec(properties)?.[1]?.trim() || undefined
}
export const modVersion = modVersionFrom(gradleProperties)

/**
 * The page's JSON-LD, the one source for the prerendered HTML and the client head. Every page describes itself (WebPage,
 * or Article for a dated story); the home also names the site and who runs it, and /downloads names the mod. No price,
 * rating or contact is stated: none is decided yet.
 */
export function structuredDataFor(page: PageMetadata, version = modVersion) {
	const origin = new URL(siteOrigin).href
	const canonical = new URL(page.path, siteOrigin).href
	const website = { '@id': `${origin}#website` }
	const organization = { '@id': `${origin}#organization` }
	const graph: Record<string, unknown>[] = [
		page.articleDate
			? {
					'@type': 'Article',
					inLanguage: page.language,
					headline: page.title,
					description: page.description,
					datePublished: page.articleDate,
					dateModified: page.updated,
					mainEntityOfPage: canonical,
					publisher: organization,
				}
			: {
					'@type': 'WebPage',
					'@id': canonical,
					inLanguage: page.language,
					name: page.title,
					description: page.description,
					url: canonical,
					dateModified: page.updated,
					isPartOf: website,
				},
	]
	if (page.path === '/')
		graph.push(
			{
				'@type': 'WebSite',
				...website,
				name: 'Minemories',
				url: origin,
				inLanguage: page.language,
				publisher: organization,
			},
			{
				'@type': 'Organization',
				...organization,
				name: 'Minemories',
				url: origin,
				sameAs: [...catalogLinks().map(link => link.url), repositoryUrl],
			}
		)
	if (page.path === '/downloads')
		graph.push({
			'@type': 'SoftwareApplication',
			name: 'Minemories',
			applicationCategory: 'GameApplication',
			applicationSubCategory: 'Minecraft Java mod',
			softwareVersion: version,
			url: canonical,
			publisher: organization,
		})
	return { '@context': 'https://schema.org', '@graph': graph }
}
