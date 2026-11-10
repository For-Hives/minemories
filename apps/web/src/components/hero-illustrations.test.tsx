// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { loadLocale } from '../i18n/catalog'
import type { Locale } from '../i18n/locales'
import { createHeroI18n } from '../lib/hero-i18n'
import { ClosingIllustration, ShareIllustration } from './HeroIllustrations'

/** Each site language and the mod's own language file it quotes (mod/shared/common/.../lang/<file>.json). */
const modLanguages: Record<Locale, string> = {
	en: 'en_us',
	'en-GB': 'en_gb',
	'en-CA': 'en_ca',
	fr: 'fr_fr',
	'fr-CA': 'fr_ca',
	de: 'de_de',
	ru: 'ru_ru',
	ko: 'ko_kr',
	ja: 'ja_jp',
	'pt-BR': 'pt_br',
	pl: 'pl_pl',
}
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const modLang = (file: string): Record<string, string> =>
	JSON.parse(
		readFileSync(join(repoRoot, `mod/shared/common/src/main/resources/assets/minemories/lang/${file}.json`), 'utf8')
	)

/** The mod writes a plain space before French "!"; the site keeps it unbreakable so the "!" never ends up alone on a line. */
const sameWords = (text: string) => text.replace(/\s/gu, ' ')

function mount() {
	const root = document.createElement('div')
	root.className = 'site'
	root.innerHTML = renderToStaticMarkup(
		<>
			<ShareIllustration />
			<ClosingIllustration />
		</>
	)
	return root
}

test('both pictures are one labelled image each, with lazy real renders of known size and no invented link path', () => {
	const root = mount()
	const figures = [...root.querySelectorAll('.mm-illus')]
	expect(figures).toHaveLength(2)
	for (const figure of figures) {
		expect(figure.getAttribute('role')).toBe('img')
		expect(figure.getAttribute('aria-label')?.length).toBeGreaterThan(40)
		expect(figure.getAttribute('data-i18n-attr')).toMatch(/^aria-label:/)
	}
	const images = [...root.querySelectorAll('img:not(.mm-brand-mark)')]
	expect(images.map(image => image.getAttribute('src'))).toEqual([
		'/hero/illus/share-link.webp',
		'/hero/illus/postcard.webp',
		'/hero/illus/closing.webp',
	])
	for (const image of images) {
		expect(image.getAttribute('loading')).toBe('lazy')
		expect(image.getAttribute('alt')).toBe('')
		expect(Number(image.getAttribute('width'))).toBeGreaterThan(0)
		expect(Number(image.getAttribute('height'))).toBeGreaterThan(0)
	}
	// the viewer's real share route is /share/:token, the token is never shown, and the address keeps its "…" (no CSS ellipsis)
	expect(root.querySelector('.mm-illus__addr')?.textContent).toBe('minemories.net/share/…')
	// rendered in French, like the rest of the prerendered landing
	expect(root.textContent).toContain('Prendre un souvenir')
	expect(root.textContent).toContain('Souvenir gardé et envoyé\u00a0!')
	expect(root.textContent).toContain('C’est notre base\u00a0! Je la fais tourner.')
	// a chat: two messages, each with its sender, yours carrying the link and the postcard
	const messages = [...root.querySelectorAll('.mm-illus__msg')]
	expect(messages.map(message => message.querySelector('.mm-illus__who')?.textContent)).toEqual(['Toi', 'Lina'])
	expect(messages[0]?.querySelector('.mm-illus__url')).not.toBeNull()
	expect(messages[0]?.querySelector('.mm-illus__postcard')).not.toBeNull()
})

test('the menu is the mod’s connected M menu: the key outside it, three tiles with "Take a memory" hovered, the answer at the bottom', () => {
	const root = mount()
	const hub = root.querySelector('.mm-illus__hub')
	expect(hub?.querySelector('.mm-illus__key')).toBeNull()
	expect(root.querySelector('.mm-illus__press .mm-illus__key')?.textContent).toBe('M')
	const tiles = [...(hub?.querySelectorAll('.mm-illus__tile') ?? [])]
	expect(tiles).toHaveLength(3)
	expect(tiles[0]?.classList.contains('is-hover')).toBe(true)
	expect(tiles[0]?.textContent).toBe('Prendre un souvenir')
	expect(hub?.lastElementChild?.classList.contains('mm-illus__sent')).toBe(true)
	expect(hub?.querySelector('.mm-illus__ok')?.textContent).toBe('Connecté')
})

test('the film bridge rewrites every word and label in the visitor language', async () => {
	await loadLocale('de')
	const root = mount()
	createHeroI18n('de', document).apply(root)
	expect(root.textContent).toContain('Ohne Minecraft, ohne Konto')
	expect(root.textContent).toContain('[Server] Der Server schließt am 1. Dezember.')
	expect(root.textContent).toContain('Erinnerung festhalten')
	expect(root.textContent).toContain('Zum Drehen ziehen')
	expect(root.querySelector('.mm-illus--closing')?.getAttribute('aria-label')).toContain('Erinnerung festhalten')
})

test('the game words are the mod’s own in every language', async () => {
	const pairs = Object.entries(modLanguages) as [Locale, string][]
	await Promise.all(pairs.map(([locale]) => loadLocale(locale)))
	for (const [locale, file] of pairs) {
		const i18n = createHeroI18n(locale, document)
		const mod = modLang(file)
		const quoted: [string, string][] = [
			['Connected', 'minemories.hub.connected'],
			['Your memories go to your gallery on their own.', 'minemories.hub.connected_hint'],
			['Take a memory', 'minemories.hub.take'],
			['Memory saved and sent!', 'minemories.hub.sent'],
		]
		for (const [key, modKey] of quoted)
			expect(sameWords(i18n.t(key)), `${locale} ${modKey}`).toBe(sameWords(mod[modKey] ?? `missing ${modKey}`))
	}
})
