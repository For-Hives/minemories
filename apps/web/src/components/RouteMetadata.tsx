import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { type Locale, localeOptions } from '../i18n/locales'
import { localizedUrl, ogLocale } from '../lib/locale-path'
import { metadataFor, siteOrigin, socialImage } from '../route-metadata'
import { structuredDataFor } from '../structured-data'

function meta(name: string, content: string, attribute: 'name' | 'property' = 'name') {
	let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
	if (!element) {
		element = document.createElement('meta')
		element.setAttribute(attribute, name)
		document.head.append(element)
	}
	element.content = content
}
function link(rel: string, href: string, hreflang?: string) {
	const element = document.createElement('link')
	element.rel = rel
	element.href = href
	if (hreflang) element.hreflang = hreflang
	document.head.append(element)
}
/** Canonical, alternates and link preview, as the prerender writes them: every language is its own page. */
function publicHead(page: ReturnType<typeof metadataFor>, locale: Locale) {
	const url = localizedUrl(page.path, siteOrigin, locale)
	link('canonical', url)
	for (const option of localeOptions) link('alternate', localizedUrl(page.path, siteOrigin, option.id), option.tag)
	link('alternate', localizedUrl(page.path, siteOrigin, 'en'), 'x-default')
	meta('og:site_name', 'Minemories', 'property')
	meta('og:title', page.title, 'property')
	meta('og:description', page.description, 'property')
	meta('og:url', url, 'property')
	meta('og:locale', ogLocale(locale), 'property')
	meta('og:type', page.articleDate ? 'article' : 'website', 'property')
	meta('og:image', new URL(socialImage.path, siteOrigin).href, 'property')
	meta('og:image:width', String(socialImage.width), 'property')
	meta('og:image:height', String(socialImage.height), 'property')
	meta('og:image:alt', socialImage.alt, 'property')
	meta('twitter:card', 'summary_large_image')
	meta('twitter:image', new URL(socialImage.path, siteOrigin).href)
	const schema = document.createElement('script')
	schema.type = 'application/ld+json'
	schema.dataset.pageSchema = ''
	schema.textContent = JSON.stringify(structuredDataFor(page))
	document.head.append(schema)
}
export function RouteMetadata() {
	// The router's path has no language prefix (it is the basename): the locale says which language this page is.
	const { pathname, hash } = useLocation()
	const { locale } = useI18n()
	const previous = useRef(pathname)
	useEffect(() => {
		const page = metadataFor(pathname, locale)
		document.title = page.title
		meta('description', page.description)
		meta('robots', page.indexable && import.meta.env.VITE_INDEXABLE === 'true' ? 'index,follow' : 'noindex,nofollow')
		for (const element of document.head.querySelectorAll(
			'[data-page-schema], link[rel="canonical"], link[rel="alternate"][hreflang]'
		))
			element.remove()
		if (page.indexable) publicHead(page, locale)
		else
			for (const element of document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]'))
				element.remove()
		if (previous.current !== pathname) {
			previous.current = pathname
			if (!hash) {
				window.scrollTo({ top: 0, behavior: 'instant' })
				document.getElementById('main-content')?.focus({ preventScroll: true })
			}
		}
	}, [pathname, hash, locale])
	return null
}
