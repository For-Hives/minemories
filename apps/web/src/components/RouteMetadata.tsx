import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { metadataFor, siteOrigin, structuredDataFor } from '../route-metadata'

function meta(name: string, content: string, attribute: 'name' | 'property' = 'name') {
	let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
	if (!element) {
		element = document.createElement('meta')
		element.setAttribute(attribute, name)
		document.head.append(element)
	}
	element.content = content
}
function publicHead(page: ReturnType<typeof metadataFor>) {
	const canonicalUrl = new URL(page.path, siteOrigin).href
	let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
	if (!canonical) {
		canonical = document.createElement('link')
		canonical.rel = 'canonical'
		document.head.append(canonical)
	}
	canonical.href = canonicalUrl
	meta('og:title', page.title, 'property')
	meta('og:description', page.description, 'property')
	meta('og:url', canonicalUrl, 'property')
	meta('og:locale', page.language === 'fr' ? 'fr_FR' : 'en_US', 'property')
	meta('og:type', page.articleDate ? 'article' : 'website', 'property')
	const schema = document.createElement('script')
	schema.type = 'application/ld+json'
	schema.dataset.pageSchema = ''
	schema.textContent = JSON.stringify(structuredDataFor(page))
	document.head.append(schema)
}
export function RouteMetadata() {
	const { pathname, hash } = useLocation()
	const { locale } = useI18n()
	const previous = useRef(pathname)
	useEffect(() => {
		const page = metadataFor(pathname, locale)
		document.title = page.title
		meta('description', page.description)
		meta('robots', page.indexable && import.meta.env.VITE_INDEXABLE === 'true' ? 'index,follow' : 'noindex,nofollow')
		document.querySelector('[data-page-schema]')?.remove()
		if (page.indexable) publicHead(page)
		else {
			document.querySelector('link[rel="canonical"]')?.remove()
			for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale'])
				document.querySelector(`meta[property="${property}"]`)?.remove()
		}
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
