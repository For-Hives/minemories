import { expect, test } from 'vitest'
import { loadLocale, translate } from './catalog'
import { formatCaptureCount } from './counts'
import { isLocale, localeOptions, localeTag, preferredLocale, resolveLocale } from './locales'
import english from './locales/en.json'

const sourceMessages = Object.keys(english)
const extraLocales = ['en', 'fr', 'ru', 'de', 'ko', 'pt-BR', 'pl', 'ja'] as const
const catalogs = import.meta.glob<Record<string, string>>('./locales/*.json', { import: 'default' })
const parameters = (message: string) => [...message.matchAll(/\{\w+\}/g)].map(match => match[0]).sort()
const protocolPattern =
	/\b(?:Minemories|Minecraft|GLB|AFK|NeoForge|Fabric|Forge|Quilt|Modrinth|CurseForge|Discord|Google|Mojang|Microsoft|WebGL|KiB|MiB|GiB|TiB)\b|(?<![\w/-])\/minemories(?: (?:pair|upload|export|select)(?: (?:first|second|status|clear))?)?(?: \d+)?|\b[\w.-]+\.(?:glb|json|jar|properties)\b/g
const protocol = (message: string) => [...message.matchAll(protocolPattern)].map(match => match[0]).sort()

test('eight languages, no regional variant, each with its own URL prefix (English has none)', () => {
	expect(localeOptions.map(option => option.id)).toEqual(['en', 'ru', 'de', 'fr', 'ko', 'pt-BR', 'pl', 'ja'])
	expect(localeOptions.map(option => option.prefix)).toEqual(['', 'ru', 'de', 'fr', 'ko', 'pt-br', 'pl', 'ja'])
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
	// retired regional choices (a saved en-GB, a Canadian browser) read their language
	expect(preferredLocale(['fr-CA', 'en-CA'])).toBe('fr')
	expect(resolveLocale('en-GB')).toBe('en')
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

	expect(translate('ja', 'Rename {name}', { name: 'Alex' })).toContain('Alex')
	expect(translate('ja', 'capture.count.other', { count: 0 })).toContain('0')
	expect(translate('ja', 'Unknown {missing}')).toBe('Unknown {missing}')
	expect(translate('ja', '__proto__')).toBe('__proto__')
})

test('a retired regional catalogue cannot be loaded', async () => {
	await expect(loadLocale('fr-CA' as never)).rejects.toThrow('Unsupported language')
	expect(translate('fr', 'Email address')).toBe('Adresse e-mail')
})

test('Russian and Polish capture counters follow CLDR rather than an English singular/plural rule', async () => {
	await Promise.all((['ru', 'pl', 'ja', 'ko', 'de'] as const).map(loadLocale))
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

test('the French catalogues speak to the player with “tu” and call a capture a capture', async () => {
	const french = await Promise.all(
		['fr'].map(locale => {
			const load = catalogs[`./locales/${locale}.json`]
			if (!load) throw new Error('Missing locale catalogue')
			return load()
		})
	)
	for (const catalog of french)
		for (const [key, message] of Object.entries(catalog)) {
			expect(message, key).not.toMatch(/\b(?:vous|votre|vos)\b/i)
			expect(message, key).not.toMatch(/snapshot/i)
		}
})

// Capitalized "Sie" is also "they"/"it" at the start of a sentence; these strings use it that way.
const germanPronounSie: Record<string, string> = {
	'This page does not list the publisher, the host or a personal-data contact yet. It describes the current project; it is not a finalized legal notice.':
		'“Sie beschreibt” refers to “Diese Seite”.',
	'The CurseForge app is the simplest: it adds Fabric API on its own.': '“Sie fügt” refers to the CurseForge app.',
	'It then goes to your gallery on its own.': '“Sie landet” refers to the capture.',
	'It will show up here.': '“Sie erscheint” refers to the capture.',
	'It lands in the export folder of your home folder: capture.glb is the latest, and every dated memory is in history.':
		'“Sie landet” refers to the memory.',
	'End portals and End gateways are saved instead of leaving a hole. They appear as a still image of the portal on every Minecraft version supported by the mod.':
		'“Sie erscheinen” refers to the portals.',
	'Your players don’t get a playable copy of your world, just a 3D scene of their corner.':
		'“Sie behalten” refers to the players.',
}

test('the German catalogue speaks to the player with “du”', async () => {
	const load = catalogs['./locales/de.json']
	if (!load) throw new Error('Missing locale catalogue')
	const catalog = await load()
	for (const key of Object.keys(germanPronounSie)) expect(catalog[key], key).toMatch(/\bSie\b/)
	for (const [key, message] of Object.entries(catalog)) {
		expect(message, key).not.toMatch(/\b(?:Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)\b/)
		if (!(key in germanPronounSie)) expect(message, key).not.toMatch(/\bSie\b/)
	}
})

// Plural "you": the group playing together, not a formal address to one player.
const russianPluralYou = new Set([
	'Minemories is a mod for Minecraft Java. In the game, it keeps a 3D copy of the area around you: your house, your village, the group’s base. You find it again in your browser, even once the server is gone.',
])

test('the Russian catalogue speaks to the player with “ты”', async () => {
	const load = catalogs['./locales/ru.json']
	if (!load) throw new Error('Missing locale catalogue')
	const catalog = await load()
	for (const key of russianPluralYou) expect(catalog[key], key).toMatch(/ваш/u)
	for (const [key, message] of Object.entries(catalog))
		if (!russianPluralYou.has(key))
			expect(message, key).not.toMatch(/(?<!\p{L})(?:вы|вас|вам|вами|ваш\p{L}*)(?!\p{L})/iu)
})
