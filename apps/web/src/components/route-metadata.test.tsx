// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { RouteMetadata } from './RouteMetadata'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
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
	expect(document.title).toContain('Un premier souvenir')
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	const schema = document.querySelector('script[data-page-schema]')?.textContent
	expect(JSON.parse(schema ?? '{}')['@type']).toBe('Article')
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain('/blog/premier-souvenir')
	fireEvent.click(screen.getByRole('link', { name: 'Private' }))
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('meta[property="og:url"]')).toBeNull()
})
test.each(['/versions', '/changelog'])('release route %s retains the preview noindex policy', path => {
	render(
		<MemoryRouter initialEntries={[path]}>
			<RouteMetadata />
		</MemoryRouter>
	)
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toContain(path)
})
