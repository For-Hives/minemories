import { repositoryUrl } from '../lib/repository'

/**
 * The main links of the site's bar, the same on every page (the landing's film bar included). Sign in and the
 * "Install the mod" button follow them. "Server closing" joins once its page exists.
 */
export const navigation = [
	{ to: '/how-it-works', label: 'How it works' },
	{ to: '/faq', label: 'FAQ' },
	// { to: '/pricing', label: 'Pricing' }, // pricing disabled
]

export type FooterLink = { label: string } & ({ to: string } | { href: string })

/**
 * The footer's groups, shared by every page's footer and the landing film's. Pages that do not exist yet (server
 * closing, safety, the Blender guide) and a contact join their group when they do; "Elsewhere" (CurseForge, GitHub)
 * is drawn by the footers from the catalog links.
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
		],
	},
	{
		label: 'Help',
		links: [
			{ to: '/faq', label: 'FAQ' },
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
