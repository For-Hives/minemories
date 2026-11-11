// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test } from 'vitest'
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
	root.className = 'site'
	root.innerHTML = renderToStaticMarkup(
		<>
			<ShareIllustration />
			<ClosingIllustration />
		</>
	)
	document.body.append(root)
	return root
}

afterEach(() => {
	document.body.replaceChildren()
	document.documentElement.lang = ''
})

test('the pictures are real footage: two clips and the postcard, lazy, of known size, each described, with French captions', () => {
	const root = mount()
	expect(root.querySelectorAll('figure.mm-illus')).toHaveLength(2)
	const images = [...root.querySelectorAll('img')]
	expect(images.map(image => image.getAttribute('src'))).toEqual([
		'/hero/clips/viewer-time.webp',
		'/hero/illus/postcard-hd.webp',
		'/hero/clips/game-browser.webp',
	])
	for (const image of images) {
		expect(image.getAttribute('loading')).toBe('lazy')
		expect(image.getAttribute('alt')?.length).toBeGreaterThan(10)
		expect(image.getAttribute('data-i18n-attr')).toMatch(/^alt:/)
		expect(Number(image.getAttribute('width'))).toBeGreaterThan(0)
		expect(Number(image.getAttribute('height'))).toBeGreaterThan(0)
	}
	// no video in the markup: a clip gets its file only once it should play (HeroClip)
	expect(root.querySelector('video')).toBeNull()
	expect(root.querySelectorAll('.mm-clip')).toHaveLength(2)
	// rendered in French, like the rest of the prerendered landing; no drawn interface, only captions and the game/browser chip
	expect([...root.querySelectorAll('.mm-clip__caption, .mm-illus__label')].map(label => label.textContent)).toEqual([
		'Choisis l’heure, du matin au coucher du soleil',
		'Carte postale HD',
		'Pas besoin d’être admin du serveur.',
	])
	expect([...root.querySelectorAll('.mm-clip__side')].map(side => side.textContent)).toEqual([
		'Dans Minecraft',
		'Dans ton navigateur',
	])
	expect(root.querySelector('.mm-illus__hub, .mm-illus__msg, .mm-illus__chat')).toBeNull()
})

test('the film bridge rewrites every caption, description and button label in the visitor language', async () => {
	await loadLocale('de')
	const root = mount()
	createHeroI18n('de', document).apply(root)
	expect(root.textContent).toContain('In deinem Browser')
	expect(root.textContent).toContain('Du musst nicht Admin des Servers sein.')
	expect(root.textContent).toContain('HD-Postkarte')
	expect(root.textContent).toContain('Video abspielen')
	expect(root.querySelector('img[src="/hero/clips/viewer-time.webp"]')?.getAttribute('alt')).toBe(
		'Eine echte Basis im Minemories-Viewer: Die Ansicht dreht sich um sie, dann geht die Tageszeit vom Morgen bis zum Sonnenuntergang.'
	)
})

test('the step that says where to click quotes the mod’s own words in every language', async () => {
	const pairs = Object.entries(modLanguages) as [Locale, string][]
	await Promise.all(pairs.map(([locale]) => loadLocale(locale)))
	for (const [locale, file] of pairs) {
		const i18n = createHeroI18n(locale, document)
		const take = modLang(file)['minemories.hub.take'] ?? 'missing minemories.hub.take'
		expect(i18n.t('Press M → Take a memory. Or go AFK for 5 minutes: the mod takes one for you.'), locale).toContain(
			take
		)
	}
})
