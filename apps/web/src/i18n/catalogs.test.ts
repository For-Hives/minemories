import { expect, test } from 'vitest'
import { loadLocale, localize, translate, translateCopy } from './catalog'
import { formatCaptureCount } from './counts'
import { isLocale, localeOptions, localeTag, preferredLocale, resolveLocale } from './locales'
import sourceMessages from './source-messages.json'

const extraLocales = ['ru', 'de', 'ko', 'pt-BR', 'pl', 'ja'] as const
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
			expect(parameters(translated ?? ''), key).toEqual(parameters(key))
			for (const token of protocol(key)) expect(protocol(translated ?? ''), key).toContain(token)
			expect(translated, key).not.toMatch(/ZXQ\d+QXZ|918273\d{3}918273|\[\[\d+\]\]/)
		}
	})
}

test('catalogues support French guide keys, English keys, nested editorial copy and safe interpolation', async () => {
	await loadLocale('ja')
	expect(translate('ja', 'Sign in')).toBe('ログイン')
	expect(translate('ja', 'Se connecter')).toBe('ログイン')
	expect(translate('ja', 'Your first memory, {name}.', { name: 'Alex' })).toContain('Alex')
	expect(translate('ja', 'Same area · {count} captures', { count: 0 })).toContain('0')
	expect(translate('ja', 'Unknown {missing}')).toBe('Unknown {missing}')
	expect(translate('ja', '__proto__')).toBe('__proto__')
	expect(translateCopy('ja', { title: 'Sign in', count: 0, choices: ['Rain', 'Snow'], enabled: true })).toEqual({
		title: 'ログイン',
		count: 0,
		choices: ['雨', '雪'],
		enabled: true,
	})
	expect(localize({ fr: 'Texte français', en: 'Sign in' }, 'fr')).toBe('Texte français')
	expect(localize({ fr: 'Texte français', en: 'Sign in' }, 'ja')).toBe('ログイン')
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

test('Russian and Polish capture counters follow CLDR rather than an English singular/plural rule', () => {
	expect([1, 2, 5, 21].map(count => formatCaptureCount('ru', count))).toEqual([
		'1 снимок',
		'2 снимка',
		'5 снимков',
		'21 снимок',
	])
	expect([1, 2, 5].map(count => formatCaptureCount('pl', count))).toEqual(['1 zrzut', '2 zrzuty', '5 zrzutów'])
	expect(formatCaptureCount('ja', 2)).toBe('キャプチャ2件')
	expect(formatCaptureCount('ko', 2)).toBe('캡처 2개')
	expect(formatCaptureCount('de', 1)).toBe('1 Aufnahme')
	expect(formatCaptureCount('de', 2)).toBe('2 Aufnahmen')
})

test('concurrent requests share one catalogue download and unknown interpolation keys stay readable', async () => {
	const first = loadLocale('ru')
	const second = loadLocale('ru')
	expect(second).toBe(first)
	await first
	expect(translate('ru', 'Sign in')).toBe('Войти')
	expect(translate('ru', 'Unknown {constructor}')).toBe('Unknown {constructor}')
})
