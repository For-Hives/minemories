// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { loadLocale } from '../i18n/catalog'
import { createHeroI18n, parseAttributeSpec, playerName } from './hero-i18n'

afterEach(() => {
	document.body.innerHTML = ''
	document.documentElement.classList.remove('mm-cjk')
})

test('keys are the English text, the player is always called Efe and unknown keys stay readable', () => {
	const i18n = createHeroI18n('fr')
	expect(i18n.locale).toBe('fr')
	expect(i18n.t('Skip the film')).toBe('Passer le film')
	expect(i18n.t('{name} joined the game')).toBe(`${playerName} a rejoint la partie`)
	expect(i18n.t('Film step {n} of {total}', { n: 2, total: 13 })).toContain('2')
	expect(i18n.t('A key that no catalogue has {n}', { n: 1 })).toBe('A key that no catalogue has 1')
})

test('apply writes texts and attributes of the current language, and the font class for Korean and Japanese', async () => {
	await Promise.all([loadLocale('ja'), loadLocale('ko')])
	document.body.innerHTML = `
		<p id="a" data-i18n="Skip the film">x</p>
		<p id="b" data-i18n="Film step {n} of {total}" data-i18n-values='{"n":3,"total":13}'>x</p>
		<p id="c" data-i18n="Skip the film" data-i18n-values="not json">x</p>
		<p id="d" data-i18n="Skip the film" data-i18n-values="5">x</p>
		<p id="e" data-i18n="Skip the film" data-i18n-values="null">x</p>
		<button id="f" data-i18n-attr="aria-label:Language;title:Menu;broken;:alsobroken">x</button>
		<span id="g" data-i18n=""></span>`
	const i18n = createHeroI18n('en')
	i18n.apply()
	expect(document.getElementById('a')?.textContent).toBe('Skip the film')
	expect(document.getElementById('b')?.textContent).toBe('Film step 3 of 13')
	expect(document.getElementById('c')?.textContent).toBe('Skip the film')
	expect(document.getElementById('d')?.textContent).toBe('Skip the film')
	expect(document.getElementById('e')?.textContent).toBe('Skip the film')
	expect(document.getElementById('f')?.getAttribute('aria-label')).toBe('Language')
	expect(document.getElementById('f')?.getAttribute('title')).toBe('Menu')
	expect(document.getElementById('f')?.attributes).toHaveLength(4)
	expect(document.getElementById('g')?.textContent).toBe('')
	expect(document.documentElement.classList.contains('mm-cjk')).toBe(false)
	i18n.set('ja')
	i18n.apply(document.body)
	expect(document.documentElement.classList.contains('mm-cjk')).toBe(true)
	expect(document.getElementById('a')?.textContent).not.toBe('Skip the film')
	i18n.set('ko')
	i18n.apply()
	expect(document.documentElement.classList.contains('mm-cjk')).toBe(true)
	i18n.set('en')
	i18n.apply()
	expect(document.documentElement.classList.contains('mm-cjk')).toBe(false)
})

test('apply works on a given document and root, with an injected translation', () => {
	const other = document.implementation.createHTMLDocument('x')
	other.body.innerHTML = '<p data-i18n="K">x</p>'
	const translate = vi.fn((_locale: string, key: string) => `<${key}>`)
	const i18n = createHeroI18n('en', other, translate as never)
	i18n.apply(other.body)
	expect(other.body.textContent).toBe('<K>')
	expect(translate).toHaveBeenCalledWith('en', 'K', { name: 'Efe' })
})

test('listeners hear a language change once, can stop, and a same-language set is silent', () => {
	const i18n = createHeroI18n('en')
	const heard: string[] = []
	const stop = i18n.onChange(() => heard.push(i18n.locale))
	i18n.set('en')
	expect(heard).toEqual([])
	i18n.set('fr')
	expect(heard).toEqual(['fr'])
	stop()
	i18n.set('en')
	expect(heard).toEqual(['fr'])
})

test('attribute specs split on the first colon only and ignore malformed parts', () => {
	expect(parseAttributeSpec('aria-label:Film chapters (keys 1 to 5)')).toEqual([
		['aria-label', 'Film chapters (keys 1 to 5)'],
	])
	expect(parseAttributeSpec('alt:A: key with a colon;title:T')).toEqual([
		['alt', 'A: key with a colon'],
		['title', 'T'],
	])
	expect(parseAttributeSpec(' ;nocolon;:x')).toEqual([])
})
