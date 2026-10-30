import { expect, test } from 'vitest'
import { loadLocale, translate } from './catalog'
import { isLocale, localeOptions, localeTag, preferredLocale, resolveLocale } from './locales'
import english from './locales/en.json'

const sourceMessages = Object.keys(english)
const extraLocales = ['en', 'fr', 'ru', 'de', 'ko', 'pt-BR', 'pl', 'ja'] as const
const catalogs = import.meta.glob<Record<string, string>>('./locales/*.json', { import: 'default' })
const parameters = (message: string) => [...message.matchAll(/\{\w+\}/g)].map(match => match[0]).sort()
const protocolPattern =
	/\b(?:Minemories|Minecraft|GLB|AFK|NeoForge|Fabric|Forge|Quilt|Modrinth|CurseForge|Discord|Google|Mojang|Microsoft|WebGL|KiB|MiB|GiB|TiB)\b|(?<![\w/-])\/minemories(?: (?:pair|upload|export|select)(?: (?:first|second|status|clear))?)?(?: \d+)?|\b[\w.-]+\.(?:glb|json|jar|properties)\b/g
const protocol = (message: string) => [...message.matchAll(protocolPattern)].map(match => match[0]).sort()

test('eleven language choices cover the ten countries, including both Canadian languages', () => {
	expect(localeOptions).toHaveLength(11)
	expect(new Set(localeOptions.map(option => option.country))).toEqual(
		new Set(['US', 'RU', 'DE', 'GB', 'FR', 'KR', 'BR', 'PL', 'CA', 'JP'])
	)
	expect(localeOptions.filter(option => option.country === 'CA').map(option => option.id)).toEqual(['en-CA', 'fr-CA'])
	for (const option of localeOptions) {
		expect(isLocale(option.id)).toBe(true)
		expect(resolveLocale(option.tag)).toBe(option.id)
		expect(Intl.getCanonicalLocales(localeTag(option.id))).toEqual([option.tag])
	}
	expect(isLocale('constructor')).toBe(false)
	expect(resolveLocale('ru_ru')).toBe('ru')
	expect(resolveLocale('de-AT')).toBe('de')
	expect(resolveLocale('pt-PT')).toBe('pt-BR')
	expect(preferredLocale(['es-MX', 'ko-KR', 'en-US'])).toBe('ko')
	expect(preferredLocale(['fr-CA', 'en-CA'])).toBe('fr-CA')
	expect(preferredLocale(['zh-CN'])).toBe('en')
})

for (const locale of extraLocales) {
	test(`${locale}: every source message is present, with parameters and protocol text preserved`, async () => {
		const load = catalogs[`./locales/${locale}.json`]
		if (!load) throw new Error('Missing locale catalogue')
		const catalog = await load()
		expect(Object.keys(catalog).sort()).toEqual([...sourceMessages].sort())
		for (const key of sourceMessages) {
			const translated = catalog[key]
			expect(translated?.trim(), key).toBeTruthy()
			expect(parameters(translated ?? ''), key).toEqual(parameters(english[key as keyof typeof english]))
			for (const token of protocol(english[key as keyof typeof english]))
				expect(protocol(translated ?? ''), key).toContain(token)
			expect(translated, key).not.toMatch(/ZXQ\d+QXZ|918273\d{3}918273|\[\[\d+\]\]/)
		}
	})
}

test('catalogues support canonical English keys and safe interpolation', async () => {
	await loadLocale('ja')
	expect(translate('ja', 'Sign in')).toBe('ログイン')

	expect(translate('ja', 'Your first memory, {name}.', { name: 'Alex' })).toContain('Alex')
	expect(translate('ja', 'Same area · {count} captures', { count: 0 })).toContain('0')
	expect(translate('ja', 'Unknown {missing}')).toBe('Unknown {missing}')
	expect(translate('ja', '__proto__')).toBe('__proto__')
})

test('regional variants preserve previous preferences and use country-appropriate terms', async () => {
	await Promise.all([loadLocale('en-GB'), loadLocale('en-CA'), loadLocale('fr-CA')])
	expect(resolveLocale('en')).toBe('en')
	expect(resolveLocale('fr')).toBe('fr')
	expect(translate('en', 'My favorites')).toBe('My favorites')
	expect(translate('en-GB', 'My favorites')).toBe('My favourites')
	expect(translate('en-CA', 'My favorites')).toBe('My favourites')
	expect(translate('fr-CA', 'Email address')).toBe('Adresse courriel')
	expect(translate('fr', 'Email address')).toBe('Adresse e-mail')
})

test('concurrent requests share one catalogue download and unknown interpolation keys stay readable', async () => {
	const first = loadLocale('pt-BR')
	const second = loadLocale('pt-BR')
	expect(second).toBe(first)
	await first
	expect(translate('pt-BR', 'Sign in')).toBe('Entrar')
	expect(translate('ru', 'Unknown {constructor}')).toBe('Unknown {constructor}')
})

const applicationSources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
test('production pages have one localization path and no bilingual copy helper', () => {
	for (const [path, source] of Object.entries(applicationSources)) {
		if (path.includes('.test.')) continue
		expect(source, path).not.toMatch(/useLocalizedCopy|translateCopy|\blocalize\(/)
	}
})
