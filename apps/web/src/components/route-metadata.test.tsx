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
test('route changes retain article schema and remove public metadata on a private shared link', () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	render(
		<MemoryRouter>
			<RouteMetadata />
			<Link to="/blog/premier-souvenir">Article</Link>
			<Link to="/share/private-token">Private</Link>
			<main id="main-content" tabIndex={-1} />
		</MemoryRouter>
	)
	fireEvent.click(screen.getByRole('link', { name: 'Article' }))
	expect(document.title).toContain('A first memory')
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	const schema = document.querySelector('script[data-page-schema]')?.textContent
	expect(JSON.parse(schema ?? '{}')['@graph'][0]['@type']).toBe('Article')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content).toBe('Minemories')
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain('/blog/premier-souvenir')
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
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('meta[property="og:url"]')).toBeNull()
	expect(document.querySelector('meta[property="og:site_name"]')).toBeNull()
	expect(document.querySelector('meta[property="og:image"]')).toBeNull()
	expect(document.querySelector('meta[name="twitter:card"]')).toBeNull()
	expect(document.querySelector('meta[name="twitter:image"]')).toBeNull()
})
test.each(['/versions', '/changelog', '/downloads'])('release route %s retains the preview noindex policy', path => {
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

test.each(['/explore', '/legal', '/roadmap', '/ranking'])('%s is public but kept out of search results', path => {
	render(
		<MemoryRouter initialEntries={[path]}>
			<RouteMetadata />
		</MemoryRouter>
	)
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
})
