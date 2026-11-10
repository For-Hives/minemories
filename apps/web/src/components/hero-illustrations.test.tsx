// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test } from 'vitest'
import { loadLocale } from '../i18n/catalog'
import { type Locale, localeTag } from '../i18n/locales'
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
const illusCss = readFileSync(join(repoRoot, 'apps/web/src/hero/illus.css'), 'utf8')

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

test('both pictures are real screenshots: lazy, of known size, each described, the in-game frame in French and in English', () => {
	const root = mount()
	expect(root.querySelectorAll('figure.mm-illus')).toHaveLength(2)
	const images = [...root.querySelectorAll('img')]
	expect(images.map(image => image.getAttribute('src'))).toEqual([
		'/hero/illus/viewer-base.webp',
		'/hero/illus/postcard-hd.webp',
		'/hero/illus/menu-fr.webp',
		'/hero/illus/menu-en.webp',
		'/hero/illus/game-tower.webp',
		'/hero/illus/viewer-tower.webp',
	])
	for (const image of images) {
		expect(image.getAttribute('loading')).toBe('lazy')
		expect(image.getAttribute('alt')?.length).toBeGreaterThan(10)
		expect(image.getAttribute('data-i18n-attr')).toMatch(/^alt:/)
		expect(Number(image.getAttribute('width'))).toBeGreaterThan(0)
		expect(Number(image.getAttribute('height'))).toBeGreaterThan(0)
	}
	// rendered in French, like the rest of the prerendered landing; no drawn interface, only captions
	expect([...root.querySelectorAll('.mm-illus__label')].map(label => label.textContent)).toEqual([
		'Dans le navigateur',
		'Carte postale HD',
		'Appuie sur M → Prendre un souvenir.',
		'Dans Minecraft',
		'Dans le navigateur',
	])
	expect(root.querySelector('.mm-illus__hub, .mm-illus__msg, .mm-illus__chat')).toBeNull()
})

test('the French frame of the M menu shows under a French page language, the English one everywhere else', () => {
	// the rules illus.css applies: French hidden by default, shown under :lang(fr), English hidden there
	// (scoped under .mm-illus, so they outweigh the `.mm-illus img { display: block }` rule)
	expect(illusCss).toMatch(/\n\.mm-illus \.mm-illus__menu--fr \{\s*display: none;/)
	expect(illusCss).toMatch(/\n\.mm-illus \.mm-illus__menu--fr:lang\(fr\) \{\s*display: block;/)
	expect(illusCss).toMatch(/\n\.mm-illus \.mm-illus__menu--en:lang\(fr\) \{\s*display: none;/)
	const root = mount()
	const shown = (locale: Locale) => {
		document.documentElement.lang = localeTag(locale)
		const french = root.querySelector('.mm-illus__menu--fr')?.matches(':lang(fr)') === true
		const english = root.querySelector('.mm-illus__menu--en')?.matches(':lang(fr)') === false
		return { fr: french, en: english }
	}
	expect(shown('fr')).toEqual({ fr: true, en: false })
	expect(shown('fr-CA')).toEqual({ fr: true, en: false })
	for (const locale of ['en', 'en-GB', 'en-CA', 'de', 'ru', 'ko', 'ja', 'pt-BR', 'pl'] as const)
		expect(shown(locale), locale).toEqual({ fr: false, en: true })
})

test('the film bridge rewrites every caption and description in the visitor language', async () => {
	await loadLocale('de')
	const root = mount()
	createHeroI18n('de', document).apply(root)
	expect(root.textContent).toContain('Drück M → Erinnerung festhalten.')
	expect(root.textContent).toContain('HD-Postkarte')
	expect(root.textContent).toContain('In Minecraft')
	expect(root.querySelector('img[src="/hero/illus/menu-en.webp"]')?.getAttribute('alt')).toContain(
		'Erinnerung festhalten'
	)
})

test('the menu’s words quoted under the frame are the mod’s own in every language', async () => {
	const pairs = Object.entries(modLanguages) as [Locale, string][]
	await Promise.all(pairs.map(([locale]) => loadLocale(locale)))
	for (const [locale, file] of pairs) {
		const i18n = createHeroI18n(locale, document)
		const take = modLang(file)['minemories.hub.take'] ?? 'missing minemories.hub.take'
		expect(i18n.t('Press M → Take a memory.'), locale).toContain(take)
		expect(
			i18n.t('The mod’s M menu open over a real base in Minecraft, the pointer on Take a memory.'),
			locale
		).toContain(take)
	}
})
