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
test('an unknown address gets no public metadata, a noindex policy and no canonical URL', () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	render(
		<MemoryRouter initialEntries={['/']}>
			<RouteMetadata />
			<Link to="/gone">Gone</Link>
			<main id="main-content" tabIndex={-1} />
		</MemoryRouter>
	)
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toMatch(/\/$/)
	fireEvent.click(screen.getByRole('link', { name: 'Gone' }))
	expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex,nofollow')
	expect(document.querySelector('script[data-page-schema]')).toBeNull()
	expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	expect(document.querySelector('meta[property="og:url"]')).toBeNull()
})

test('switching locale updates the landing title, description and schema without publishing fictitious alternate URLs', () => {
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
			<MemoryRouter initialEntries={['/']}>
				<RouteMetadata />
				<Switch />
			</MemoryRouter>
		</I18nProvider>
	)
	const french = document.title
	fireEvent.click(screen.getByRole('button', { name: 'English' }))
	expect(document.title).not.toBe(french)
	expect(document.title).toContain('Minemories')
	expect(document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content).toBe('en_US')
	expect(JSON.parse(document.querySelector('[data-page-schema]')?.textContent ?? '{}').inLanguage).toBe('en')
	expect(document.querySelector('link[hreflang]')).toBeNull()
})
