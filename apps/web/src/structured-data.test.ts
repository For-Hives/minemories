import { expect, test } from 'vitest'
import { metadataFor, publicMetadata } from './route-metadata'
import { modVersion, modVersionFrom, structuredDataFor } from './structured-data'

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const nodes = (path: string) => structuredDataFor(metadataFor(path))['@graph']
const ofType = (path: string, type: string) => nodes(path).find(node => node['@type'] === type)

test('every indexable page says when it last changed, as a real calendar date the sitemap can use', () => {
	const indexable = publicMetadata.filter(page => page.indexable)
	expect(indexable.length).toBeGreaterThan(10)
	for (const page of indexable) {
		expect(page.updated, page.path).toMatch(isoDate)
		expect(new Date(`${page.updated}T00:00:00Z`).toISOString().slice(0, 10), page.path).toBe(page.updated)
	}
})

test('the public gallery, the legal page and the roadmap are prerendered but kept out of search results', () => {
	for (const path of ['/explore', '/ranking', '/legal', '/roadmap']) {
		expect(publicMetadata.find(page => page.path === path)?.indexable, path).toBe(false)
		expect(metadataFor(path).indexable, path).toBe(false)
	}
})

test('the home page names the site and its organization, linked to CurseForge and GitHub only', () => {
	const website = ofType('/', 'WebSite')
	const organization = ofType('/', 'Organization')
	expect(website).toMatchObject({ '@id': 'https://minemories.net/#website', name: 'Minemories', inLanguage: 'fr' })
	expect(website?.publisher).toEqual({ '@id': organization?.['@id'], name: 'Minemories' })
	expect(organization).toMatchObject({ name: 'Minemories', url: 'https://minemories.net/' })
	expect(organization?.sameAs).toEqual([
		'https://www.curseforge.com/minecraft/mc-mods/minemories',
		'https://github.com/For-Hives/minemories',
	])
	expect(JSON.stringify(organization)).not.toMatch(/modrinth|email|address|telephone/i)
	for (const path of ['/faq', '/downloads']) {
		expect(ofType(path, 'WebSite'), path).toBeUndefined()
		expect(ofType(path, 'Organization'), path).toBeUndefined()
	}
})

test('the downloads page identifies the mod, without a price or a rating', () => {
	const application = ofType('/downloads', 'SoftwareApplication')
	expect(application).toMatchObject({
		name: 'Minemories',
		applicationCategory: 'GameApplication',
		softwareVersion: modVersion,
		url: 'https://minemories.net/downloads',
	})
	expect(modVersion).toMatch(/^\d+\.\d+\.\d+/)
	expect(application).not.toHaveProperty('offers')
	expect(application).not.toHaveProperty('aggregateRating')
	expect(ofType('/', 'SoftwareApplication')).toBeUndefined()
	expect(structuredDataFor(metadataFor('/downloads'), '1.2.3')['@graph'].at(-1)?.softwareVersion).toBe('1.2.3')
})

test('each page describes itself, with its date, and stories stay articles', () => {
	expect(nodes('/faq')[0]).toMatchObject({
		'@type': 'WebPage',
		url: 'https://minemories.net/faq',
		dateModified: metadataFor('/faq').updated,
		isPartOf: { '@id': 'https://minemories.net/#website', name: 'Minemories' },
	})
	const article = nodes('/blog/premier-souvenir')[0]
	expect(article?.['@type']).toBe('Article')
	expect(article?.datePublished).toMatch(isoDate)
})

test('the mod version is read from the Gradle properties, and missing when they do not name one', () => {
	expect(modVersionFrom('org.gradle.jvmargs=-Xmx2G\nmod_version=0.37.0-beta.1\nmod_id=minemories\n')).toBe(
		'0.37.0-beta.1'
	)
	expect(modVersionFrom('mod_id=minemories\n')).toBeUndefined()
	expect(modVersionFrom('mod_version=\n')).toBeUndefined()
})
