import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useI18n } from '../i18n/I18n'
import type { Locale } from '../i18n/locales'
import { ogLocale, previewUrl } from '../lib/link-language'
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
/** `page` is in the rendered language (JSON-LD), `headLocale` names the head's: the same card as the prerendered page. */
function publicHead(page: ReturnType<typeof metadataFor>, headLocale: Locale) {
	const preview = metadataFor(page.path, headLocale)
	const canonicalUrl = new URL(page.path, siteOrigin).href
	let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
	if (!canonical) {
		canonical = document.createElement('link')
		canonical.rel = 'canonical'
		document.head.append(canonical)
	}
	canonical.href = canonicalUrl
	meta('og:site_name', 'Minemories', 'property')
	meta('og:title', preview.title, 'property')
	meta('og:description', preview.description, 'property')
	meta('og:url', previewUrl(page.path, siteOrigin, headLocale), 'property')
	meta('og:locale', ogLocale(headLocale), 'property')
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
	const { pathname, hash } = useLocation()
	const { locale, chosen } = useI18n()
	const previous = useRef(pathname)
	useEffect(() => {
		const page = metadataFor(pathname, locale)
		// The head is English unless a language was chosen (the link's ?lang=, a saved choice or the switcher).
		const headLocale = chosen ? locale : 'en'
		const head = metadataFor(pathname, headLocale)
		document.title = head.title
		meta('description', head.description)
		meta('robots', page.indexable && import.meta.env.VITE_INDEXABLE === 'true' ? 'index,follow' : 'noindex,nofollow')
		document.querySelector('[data-page-schema]')?.remove()
		if (page.indexable) publicHead(page, headLocale)
		else {
			document.querySelector('link[rel="canonical"]')?.remove()
			for (const element of document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]'))
				element.remove()
		}
		if (previous.current !== pathname) {
			previous.current = pathname
			if (!hash) {
				window.scrollTo({ top: 0, behavior: 'instant' })
				document.getElementById('main-content')?.focus({ preventScroll: true })
			}
		}
	}, [pathname, hash, locale, chosen])
	return null
}
