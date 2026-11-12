import { expect, test } from 'vitest'
import { faqGroups } from './content/faq'
import { metadataFor, publicMetadata } from './route-metadata'
import { modVersion, modVersionFrom, structuredDataFor } from './structured-data'

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const nodes = (path: string) => structuredDataFor(metadataFor(path))['@graph']
const ofType = (path: string, type: string) => nodes(path).find(node => node['@type'] === type)

test('every indexable page says when it last changed, as a real calendar date the sitemap can use', () => {
	const indexable = publicMetadata.filter(page => page.indexable)
	expect(indexable.length).toBeGreaterThanOrEqual(10)
	for (const page of indexable) {
		expect(page.updated, page.path).toMatch(isoDate)
		expect(new Date(`${page.updated}T00:00:00Z`).toISOString().slice(0, 10), page.path).toBe(page.updated)
	}
})

test('the public gallery, the legal page and the roadmap are prerendered but kept out of search results', () => {
	for (const path of ['/explore', '/legal', '/roadmap']) {
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
	expect(nodes('/downloads')[0]).toMatchObject({ '@type': 'WebPage', url: 'https://minemories.net/downloads' })
	expect(nodes('/faq')[0]).toMatchObject({
		'@type': 'FAQPage',
		url: 'https://minemories.net/faq',
		dateModified: metadataFor('/faq').updated,
		isPartOf: { '@id': 'https://minemories.net/#website', name: 'Minemories' },
	})
	const story = { ...metadataFor('/faq'), path: '/story', articleDate: '2026-10-14' }
	const article = structuredDataFor(story)['@graph'][0]
	expect(article).toMatchObject({
		'@type': 'Article',
		datePublished: '2026-10-14',
		mainEntityOfPage: 'https://minemories.net/story',
	})
})

test('the Blender guide is an article by For-Hives with a breadcrumb back to the home', () => {
	const [article, breadcrumb] = nodes('/guides/minecraft-blender')
	expect(article).toMatchObject({
		'@type': 'Article',
		datePublished: '2026-11-10',
		dateModified: '2026-11-10',
		author: { '@type': 'Organization', name: 'For-Hives' },
		headline: 'Exporter une construction Minecraft vers Blender (GLB)',
	})
	expect(breadcrumb).toMatchObject({
		'@type': 'BreadcrumbList',
		itemListElement: [
			{ position: 1, name: 'Minemories', item: 'https://minemories.net/' },
			{
				position: 2,
				name: 'Exporter une construction Minecraft vers Blender (GLB)',
				item: 'https://minemories.net/guides/minecraft-blender',
			},
		],
	})
	expect(nodes('/safety').map(node => node['@type'])).toEqual(['WebPage'])
})

test('the FAQ page lists every visible question with its answer, in the page language', () => {
	const faq = nodes('/faq')[0] as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
	expect(faq.mainEntity).toHaveLength(faqGroups.flatMap(group => group.ids).length)
	const ban = faq.mainEntity.find(entry => entry.name === 'Je risque un ban ?')
	expect(ban?.acceptedAnswer.text).toContain('règles')
	const versions = faq.mainEntity.find(entry => entry.name === 'Quelles versions ?')
	expect(versions?.acceptedAnswer.text).toContain('1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11')
	expect(versions?.acceptedAnswer.text).not.toMatch(/1\.16\.5,|\{/)
	const english = structuredDataFor(metadataFor('/faq', 'en'))['@graph'][0] as typeof faq
	expect(english.mainEntity[0]?.name).toBe('Does it work on Bedrock, consoles or phones?')
	expect(JSON.stringify(faq)).not.toMatch(/gratuit|free|open source/i)
})

test('the mod version is read from the Gradle properties, and missing when they do not name one', () => {
	expect(modVersionFrom('org.gradle.jvmargs=-Xmx2G\nmod_version=0.37.0-beta.1\nmod_id=minemories\n')).toBe(
		'0.37.0-beta.1'
	)
	expect(modVersionFrom('mod_id=minemories\n')).toBeUndefined()
	expect(modVersionFrom('mod_version=\n')).toBeUndefined()
})
