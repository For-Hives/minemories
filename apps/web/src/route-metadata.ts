import { discoveryPages } from './content/discovery.ts'
import { articles } from './content/site-content.ts'
import { localize, translate } from './i18n/catalog.ts'
import type { Locale } from './i18n/I18n.tsx'
import { isFrench, localeTag } from './i18n/locales.ts'
import { englishMetadata } from './i18n/metadata-en.ts'
export interface PageMetadata {
	path: string
	title: string
	description: string
	indexable: boolean
	language: string
	articleDate?: string
}
export const publicMetadata: PageMetadata[] = [
	{
		path: '/decouvrir',
		title: 'Découvrir Minemories — Un monde, plusieurs souvenirs',
		description: 'Code public, nostalgie, partage et classement : découvre les usages de Minemories.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/explorer',
		title: 'Galerie publique — Minemories',
		description: 'Explore les souvenirs Minecraft publiés volontairement après modération et leur classement.',
		indexable: true,
		language: 'fr',
	},
	...discoveryPages.map(page => ({
		path: page.path,
		title: `${page.label.fr} — Minemories`,
		description: page.lead.fr,
		indexable: true,
		language: 'fr' as const,
	})),
	{
		path: '/',
		title: 'Minemories — Les mondes construits ensemble',
		description:
			'Capture une zone Minecraft en souvenir 3D et revisite-la dans ton navigateur. Installation, galerie privée et partage choisi.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/concept',
		title: 'Le concept — Minemories',
		description:
			'Garder les lieux construits ensemble : un souvenir 3D à revisiter, en complément de ta sauvegarde Minecraft.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/fonctionnement',
		title: 'Comment ça marche — Minemories',
		description: 'Du monde Minecraft au souvenir 3D : capture locale, appairage, galerie privée et partage.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/installation',
		title: 'Installer le mod — Minemories',
		description:
			'Guide pas à pas pour Minecraft Java 1.21.1 et NeoForge 21.1.248. Télécharge le JAR, installe-le et crée ton premier souvenir.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/versions',
		title: 'Versions du mod — Minemories',
		description:
			'Télécharge les JAR Minemories pour Minecraft Java 1.21.1 avec NeoForge, Fabric ou Forge et retrouve les versions précédentes.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/changelog',
		title: 'Nouveautés du mod — Minemories',
		description:
			'Les notes officielles des releases Minemories : nouveautés, corrections et téléchargements depuis GitHub.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/faq',
		title: 'Questions fréquentes — Minemories',
		description:
			'Compatibilité du mod, fichiers GLB, captures AFK, confidentialité et partage : les réponses pour commencer.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/blog',
		title: 'Le journal des souvenirs — Minemories',
		description: 'Des guides et des repères pour garder et revisiter tes souvenirs Minecraft.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/pricing',
		title: 'Snapshots et cloud longue durée — Minemories',
		description: 'Estime le stockage de tes captures. Paiements désactivés ; offre commerciale à confirmer.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/privacy',
		title: 'Confidentialité — Minemories',
		description: 'Ouverture locale, compte, galerie privée, liens de partage et conservation des captures.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/terms',
		title: 'Conditions d’utilisation — Minemories',
		description: 'Repères pour utiliser cette version expérimentale, capturer et partager en respectant les autres.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/legal',
		title: 'À propos du service — Minemories',
		description: 'Projet indépendant, dépôt public et état des informations juridiques à compléter.',
		indexable: true,
		language: 'fr',
	},
	...articles.map(article => ({
		path: `/blog/${article.slug}`,
		title: `${article.title.fr} — Minemories`,
		description: article.summary.fr,
		indexable: true,
		language: 'fr' as const,
		articleDate: article.published,
	})),
]
const trailingSlash = /\/$/
export function metadataFor(pathname: string, locale: Locale = 'fr'): PageMetadata {
	const path = pathname.replace(trailingSlash, '') || '/'
	const page: PageMetadata = publicMetadata.find(page => page.path === path) ?? {
		path,
		title: 'Minemories — Espace personnel',
		description: 'Ton espace Minemories.',
		indexable: false,
		language: 'fr',
	}
	if (isFrench(locale)) return { ...page, language: locale === 'fr' ? 'fr' : localeTag(locale) }
	if (!page.indexable)
		return {
			...page,
			title: translate(locale, 'Minemories — Your space'),
			description: translate(locale, 'Your Minemories space.'),
			language: locale === 'en' ? 'en' : localeTag(locale),
		}
	const discovery = discoveryPages.find(item => item.path === path)
	const article = articles.find(item => `/blog/${item.slug}` === path)
	let translated = englishMetadata[path]
	if (discovery)
		translated = {
			title: `${localize(discovery.label, locale)} — Minemories`,
			description: localize(discovery.lead, locale),
		}
	if (article)
		translated = {
			title: `${localize(article.title, locale)} — Minemories`,
			description: localize(article.summary, locale),
		}
	return translated
		? {
				...page,
				title: translate(locale, translated.title),
				description: translate(locale, translated.description),
				language: locale === 'en' ? 'en' : localeTag(locale),
			}
		: { ...page, language: localeTag(locale) }
}
export const siteOrigin = import.meta.env?.VITE_SITE_URL ?? 'https://minemories.xenos.lightin.io'

export function structuredDataFor(page: PageMetadata) {
	const canonical = new URL(page.path, siteOrigin).href
	if (page.articleDate)
		return {
			'@context': 'https://schema.org',
			'@type': 'Article',
			inLanguage: page.language,
			headline: page.title,
			description: page.description,
			datePublished: page.articleDate,
			mainEntityOfPage: canonical,
		}
	return {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		inLanguage: page.language,
		name: page.title,
		description: page.description,
		url: canonical,
	}
}
