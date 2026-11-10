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

function mount() {
	const root = document.createElement('div')
	root.innerHTML = renderToStaticMarkup(
		<>
			<ShareIllustration />
			<ClosingIllustration />
		</>
	)
	return root
}

test('both pictures are one labelled image each, with lazy real frames of known size and no invented link path', () => {
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
		'/hero/illus/diorama.webp',
		'/hero/illus/postcard.webp',
		'/hero/illus/closing.webp',
	])
	for (const image of images) {
		expect(image.getAttribute('loading')).toBe('lazy')
		expect(image.getAttribute('alt')).toBe('')
		expect(Number(image.getAttribute('width'))).toBeGreaterThan(0)
		expect(Number(image.getAttribute('height'))).toBeGreaterThan(0)
	}
	// the viewer's real share route is /share/:token
	expect(root.textContent).toContain('minemories.net/share/')
	// rendered in French, like the rest of the prerendered landing
	expect(root.textContent).toContain('Prendre un souvenir')
	expect(root.textContent).toContain('Souvenir gardé et envoyé !')
})

test('the film bridge rewrites every word and label in the visitor language', async () => {
	await loadLocale('de')
	const root = mount()
	createHeroI18n('de', document).apply(root)
	expect(root.textContent).toContain('Ohne Minecraft, ohne Konto')
	expect(root.textContent).toContain('[Server] Der Server schließt am 1. Dezember.')
	expect(root.textContent).toContain('Erinnerung festhalten')
	expect(root.querySelector('.mm-illus--closing')?.getAttribute('aria-label')).toContain('Erinnerung festhalten')
})

test('the game labels are the mod’s own words in every language', async () => {
	const pairs = Object.entries(modLanguages) as [Locale, string][]
	await Promise.all(pairs.map(([locale]) => loadLocale(locale)))
	for (const [locale, file] of pairs) {
		const i18n = createHeroI18n(locale, document)
		const mod = modLang(file)
		expect(i18n.t('Take a memory'), locale).toBe(mod['minemories.hub.take'])
		expect(i18n.t('Memory saved and sent!'), locale).toBe(mod['minemories.hub.sent'])
	}
})
