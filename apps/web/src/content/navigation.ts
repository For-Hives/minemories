import { repositoryUrl } from '../lib/repository'

export type FooterLink = { label: string } & ({ to: string } | { href: string })

/**
 * The footer's groups, shared by every page's footer and the landing film's. A contact joins "Help" once one is
 * decided; "Elsewhere" (CurseForge, GitHub) is drawn by the footers from the catalog links.
 */
export const footerGroups: Array<{ label: string; links: FooterLink[] }> = [
	{
		label: 'Product',
		links: [
			{ to: '/concept', label: 'The concept' },
			{ to: '/how-it-works', label: 'How it works' },
			{ to: '/sharing', label: 'Share by link' },
			{ to: '/explore', label: 'Public gallery' },
		],
	},
	{
		label: 'Guides',
		links: [
			{ to: '/installation', label: 'Install the mod' },
			{ to: '/downloads', label: 'Downloads' },
			{ to: '/server-closing', label: 'Server closing' },
			{ to: '/guides/minecraft-blender', label: 'Minecraft to Blender' },
		],
	},
	{
		label: 'Help',
		links: [
			{ to: '/faq', label: 'FAQ' },
			{ to: '/safety', label: 'Safety and parents' },
			{ to: '/versions', label: 'Versions' },
			{ to: '/roadmap', label: 'Roadmap' },
			{ href: `${repositoryUrl}/issues`, label: 'Report a bug (GitHub)' },
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

export type NavSection = { label?: string; links: FooterLink[] }
export type NavMenu = { id: 'product' | 'guides' | 'help'; label: string; sections: NavSection[] }

/** The landing's own sections, first in its "Product" menu: they glide to the section (hero.js) and wait for the end of the film. */
export const landingSections = [
	{ href: '#steps', label: 'How it works' },
	{ href: '#share', label: 'Show it to the group' },
	{ href: '#server-closing', label: 'Your server is closing?' },
	{ href: '#faq', label: 'FAQ' },
]

const group = (label: string) => footerGroups.find(entry => entry.label === label)?.links ?? []

/**
 * The bar's menus, built from the footer's groups so that every page of the site is one click away from the bar: Product, Guides and Help
 * (the legal pages at its bottom). On the landing, Product starts with the page's own sections.
 */
export function navMenus(landing = false): NavMenu[] {
	const product: NavSection[] = [{ links: group('Product') }]
	if (landing) product.unshift({ label: 'On this page', links: landingSections })
	return [
		{ id: 'product', label: 'Product', sections: product },
		{ id: 'guides', label: 'Guides', sections: [{ links: group('Guides') }] },
		{ id: 'help', label: 'Help', sections: [{ links: group('Help') }, { label: 'Legal', links: group('Legal') }] },
	]
}
