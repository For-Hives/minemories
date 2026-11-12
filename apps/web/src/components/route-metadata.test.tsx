// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider, useI18n } from '../i18n/I18n'
import { RouteMetadata } from './RouteMetadata'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	localStorage.clear()
	for (const element of document.head.querySelectorAll('meta,link,script[data-page-schema]')) element.remove()
})
test('route changes set the page schema and remove public metadata on a private shared link', () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	render(
		<MemoryRouter>
			<RouteMetadata />
			<Link to="/how-it-works">Article</Link>
			<Link to="/share/private-token">Private</Link>
			<main id="main-content" tabIndex={-1} />
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('link', { name: 'Article' }))
	expect(document.title).toBe('How Minemories captures your Minecraft build')
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	const schema = document.querySelector('script[data-page-schema]')?.textContent
	expect(JSON.parse(schema ?? '{}')['@graph'][0]['@type']).toBe('WebPage')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content).toBe('Minemories')
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain('/how-it-works')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content).toBe(
		'https://minemories.net/brand/og-image.png'
	)
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:image:width"]')?.content).toBe('1200')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:image:height"]')?.content).toBe('630')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:image:alt"]')?.content).toBe('Minemories')
	expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:card"]')?.content).toBe('summary_large_image')
	expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content).toBe(
		'https://minemories.net/brand/og-image.png'
	)
	fireEvent.click(screen.getByRole('link', { name: 'Private' }))
	// A shared link's tab carries the same neutral card as its link preview (app.html), never "Your space".
	expect(document.title).toBe('A Minecraft place in 3D, shared with you')
	expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toBe(
		'Open it in your browser and turn around it.'
	)
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('meta[property="og:url"]')).toBeNull()
	expect(document.querySelector('meta[property="og:site_name"]')).toBeNull()
	expect(document.querySelector('meta[property="og:image"]')).toBeNull()
	expect(document.querySelector('meta[name="twitter:card"]')).toBeNull()
	expect(document.querySelector('meta[name="twitter:image"]')).toBeNull()
})
test.each(['/versions', '/downloads'])('release route %s retains the preview noindex policy', path => {
	render(
		<MemoryRouter initialEntries={[path]}>
			<RouteMetadata />
		</MemoryRouter>
	)
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain(path)
})

test('switching locale updates titles, descriptions and schema without publishing fictitious alternate URLs', () => {
	function Switch() {
		const { setLocale } = useI18n()
		return (
			<button type="button" onClick={() => setLocale('en')}>
				English
			</button>
		)
	}
	render(
		<I18nProvider>
			<MemoryRouter initialEntries={['/installation']}>
				<RouteMetadata />
				<Switch />
			</MemoryRouter>
		</I18nProvider>
	)
	expect(document.title).toBe('Installer Minemories sur Fabric, Forge ou NeoForge')
	fireEvent.click(screen.getByRole('button', { name: 'English' }))
	expect(document.title).toBe('Install Minemories on Fabric, Forge or NeoForge')
	expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toContain(
		'Choose your Minecraft Java version'
	)
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content).toBe('en_US')
	expect(JSON.parse(document.querySelector('[data-page-schema]')?.textContent ?? '{}')['@graph'][0].inLanguage).toBe(
		'en'
	)
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain('/installation')
	expect(document.querySelector('link[hreflang]')).toBeNull()
})

test.each(['/explore', '/legal', '/roadmap'])('%s is public but kept out of search results', path => {
	render(
		<MemoryRouter initialEntries={[path]}>
			<RouteMetadata />
		</MemoryRouter>
	)
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
})

test('the private shell carries the shared-link card in French, and other private pages keep their own title', async () => {
	const { appShell, metadataFor } = await import('../route-metadata')
	expect(appShell).toEqual({
		title: 'Un lieu Minecraft en 3D, partagé avec toi',
		description: 'Ouvre-le dans ton navigateur et tourne autour.',
	})
	expect(metadataFor('/public/11111111-1111-4111-8111-111111111111').description).toBe(
		'Ouvre-le dans ton navigateur et tourne autour.'
	)
	expect(metadataFor('/gallery', 'en').title).toBe('Minemories — Your space')
	expect(metadataFor('/share', 'en').title).toBe('Minemories — Your space')
})
