import { repositoryUrl } from '../lib/repository'
import { catalogLinks } from '../pages/installation-loaders'

/** A link of the footer or of the bar's menus; `plain` labels are names (CurseForge, GitHub), never translated. */
export type FooterLink = { label: string; plain?: true } & ({ to: string } | { href: string })

/**
 * The footer's groups, shared by every page's footer and the landing film's. A contact joins "Help" once one is
 * decided; "Elsewhere" (CurseForge, GitHub) is drawn by the footers from the catalog links.
 */
export const footerGroups: Array<{ label: string; links: FooterLink[] }> = [
	{
		label: 'Product',
		links: [
			{ to: '/concept', label: 'What is Minemories?' },
			{ to: '/how-it-works', label: 'How it works' },
			{ to: '/sharing', label: 'How do I share a link?' },
			{ to: '/explore', label: 'See other players’ builds' },
		],
	},
	{
		label: 'Guides',
		links: [
			{ to: '/installation', label: 'Install the mod' },
			{ to: '/downloads', label: 'Downloads' },
			{ to: '/server-closing', label: 'What if my server shuts down?' },
			{ to: '/guides/minecraft-blender', label: 'Open my build in Blender' },
		],
	},
	{
		label: 'Help',
		links: [
			{ to: '/faq', label: 'FAQ' },
			{ to: '/safety', label: 'Is it safe?' },
			{ to: '/versions', label: 'What’s new' },
			{ to: '/roadmap', label: 'What’s coming next' },
			{ href: `${repositoryUrl}/issues`, label: 'Found a bug? Tell us on GitHub' },
		],
	},
	{
		label: 'Legal',
		links: [
			{ to: '/privacy', label: 'Privacy' },
			{ to: '/terms', label: 'Terms' },
			{ to: '/legal', label: 'About and legal notice' },
		],
	},
]

/** A group of a menu; `kind: 'sections'` marks the landing's own sections (a ↓ before their heading, hidden during the film). */
export type NavSection = { label?: string; kind?: 'sections'; links: FooterLink[] }
export type NavMenu = { id: 'product' | 'guides' | 'help'; label: string; sections: NavSection[] }

/**
 * The landing's own sections, first in its "Product" menu: they glide to the section (hero.js) and wait for the end of the film. Their
 * names are their own, never a page's ("How it works" and "FAQ" are pages of the menus too).
 */
export const landingSections = [
	{ href: '#steps', label: 'The three steps' },
	{ href: '#share', label: 'Show your base to your friends' },
	{ href: '#server-closing', label: 'Server shutting down?' },
	{ href: '#faq', label: 'Questions' },
]

/** The mod's catalogs and the source code, at the bottom of Help (and in the footers' "Elsewhere"). */
export function elsewhereLinks(): FooterLink[] {
	return [
		...catalogLinks().map(catalog => ({ href: catalog.url, label: catalog.name, plain: true as const })),
		{ href: repositoryUrl, label: 'GitHub', plain: true },
	]
}

const group = (label: string) => footerGroups.find(entry => entry.label === label)?.links ?? []

/**
 * The bar's menus, built from the footer's groups so that every page of the site is one click away from the bar: Product, Guides and Help
 * (the legal pages and the outside links at its bottom). On the landing, Product starts with the page's own sections, then its pages.
 */
export function navMenus(landing = false): NavMenu[] {
	const product: NavSection[] = landing
		? [
				{ label: 'On this page', kind: 'sections', links: landingSections },
				{ label: 'Pages', links: group('Product') },
			]
		: [{ links: group('Product') }]
	return [
		{ id: 'product', label: 'Product', sections: product },
		{ id: 'guides', label: 'Guides', sections: [{ links: group('Guides') }] },
		{
			id: 'help',
			label: 'Help',
			sections: [
				{ links: group('Help') },
				{ label: 'Legal', links: group('Legal') },
				{ label: 'Elsewhere', links: elsewhereLinks() },
			],
		},
	]
}
