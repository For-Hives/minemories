// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppContext, type AppContextValue } from '../app-context'
import { I18nProvider } from '../i18n/I18n'
import { authProviderKey, defaultWebsiteId, optOutKey, signupSeenKey } from '../lib/insight'
import { InsightIdentity, InsightPreference, rememberAuthProvider } from './Insight'
import { identify, resetInsightForTests, sessionData, setInsightDisabled, startInsight, track } from './insight'

const production = {
	PROD: true,
	MODE: 'production',
	VITE_API_URL: 'https://api.minemories.net',
} as unknown as ImportMetaEnv
function tracker() {
	const umami = { track: vi.fn(), identify: vi.fn() }
	window.umami = umami as never
	return umami
}
function script() {
	return document.head.querySelector<HTMLScriptElement>('script[src$="/api/insight/script.js"]')
}

beforeEach(() => {
	localStorage.clear()
	sessionStorage.clear()
	resetInsightForTests()
	for (const node of document.head.querySelectorAll('script')) node.remove()
	Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true })
})
afterEach(() => {
	cleanup()
	resetInsightForTests()
})

test('loads the tracker through the API with vitals, errors and the cleaning hook', () => {
	startInsight(production)
	startInsight(production)
	expect(document.head.querySelectorAll('script')).toHaveLength(1)
	expect(script()?.src).toBe('https://api.minemories.net/api/insight/script.js')
	expect(window.umamiConfig).toMatchObject({
		websiteId: defaultWebsiteId,
		hostUrl: 'https://api.minemories.net/api/insight',
		domains: ['minemories.net'],
		performance: true,
		errors: true,
		excludeHash: true,
		beforeSend: 'minemoriesInsightBeforeSend',
	})
	const clean = window.minemoriesInsightBeforeSend
	expect(clean?.('event', { url: `${window.location.origin}/share/secret?x=1` })).toEqual({
		url: `${window.location.origin}/share/:token`,
	})
	localStorage.setItem(optOutKey, '1')
	expect(clean?.('event', { url: '/faq' })).toBeNull()
})

test('loads nothing without a website, after an opt-out or when the browser refuses', () => {
	startInsight({ PROD: false } as unknown as ImportMetaEnv)
	expect(script()).toBeNull()
	setInsightDisabled(true)
	startInsight(production)
	expect(script()).toBeNull()
	setInsightDisabled(false)
	Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
	startInsight(production)
	expect(script()).toBeNull()
	track('signout')
	expect(window.umami).toBeUndefined()
})

test('queues calls until the tracker arrives, then replays them in order', () => {
	startInsight(production)
	track('pairing-code')
	identify('u1', { locale: 'en' })
	sessionData({ paired: true })
	const umami = tracker()
	umami.track.mockImplementationOnce(() => {
		throw new Error('blocked')
	})
	script()?.dispatchEvent(new Event('load'))
	expect(umami.track).toHaveBeenCalledWith('pairing-code', undefined)
	expect(umami.identify).toHaveBeenNthCalledWith(1, 'u1', { locale: 'en' })
	expect(umami.identify).toHaveBeenNthCalledWith(2, { paired: true })
	umami.track.mockImplementationOnce(() => {
		throw new Error('blocked')
	})
	expect(() => track('share-create', { scope: 'memory' })).not.toThrow()
	track('share-revoke', { scope: 'memory' })
	expect(umami.track).toHaveBeenLastCalledWith('share-revoke', { scope: 'memory' })
})

test('counts mod downloads and links to other sites', () => {
	startInsight(production)
	const umami = tracker()
	document.body.innerHTML = `
		<a id="jar" href="https://api.minemories.net/downloads/1.21.1-fabric/latest"><span>JAR</span></a>
		<a id="out" href="https://www.curseforge.com/minecraft/mc-mods/minemories">CurseForge</a>
		<a id="off" data-insight="off" href="https://discord.gg/x">Discord</a>
		<a id="in" href="/faq">FAQ</a>`
	const click = (id: string) =>
		document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
	const stop = (event: Event) => event.preventDefault()
	document.addEventListener('click', stop)
	document.querySelector('#jar span')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
	click('out')
	click('off')
	click('in')
	document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
	document.removeEventListener('click', stop)
	expect(umami.track.mock.calls).toEqual([
		['mod-download', { target: '1.21.1-fabric', version: 'latest', page: '/' }],
		['outbound', { host: 'curseforge.com', page: '/' }],
	])
})

test('storage failures never break the page', () => {
	const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('denied')
	})
	const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('denied')
	})
	expect(() => setInsightDisabled(true)).not.toThrow()
	startInsight(production)
	expect(script()).not.toBeNull()
	expect(() => rememberAuthProvider('google')).not.toThrow()
	get.mockRestore()
	set.mockRestore()
})

function withSession(user: { id: string; createdAt: Date } | null, children: React.ReactNode) {
	const context = { session: user ? { user, session: {} } : null } as unknown as AppContextValue
	return (
		<I18nProvider initialLocale="en">
			<AppContext.Provider value={context}>{children}</AppContext.Provider>
		</I18nProvider>
	)
}

test('identifies an account by its pseudonym and counts a new account once', async () => {
	startInsight(production)
	const umami = tracker()
	rememberAuthProvider('discord')
	const user = { id: 'account-1', createdAt: new Date() }
	render(withSession(user, <InsightIdentity />))
	await waitFor(() => expect(umami.track).toHaveBeenCalledWith('signup', { method: 'discord' }))
	expect(umami.identify).toHaveBeenCalledWith(expect.stringMatching(/^u[0-9a-f]{31}$/), {
		locale: 'en',
		signedIn: true,
		joined: user.createdAt.toISOString().slice(0, 7),
	})
	expect(sessionStorage.getItem(authProviderKey)).toBeNull()
	expect(localStorage.getItem(signupSeenKey)).toMatch(/^u/)
	cleanup()
	umami.track.mockClear()
	rememberAuthProvider('email')
	render(withSession(user, <InsightIdentity />))
	await waitFor(() => expect(umami.track).toHaveBeenCalledWith('login', { method: 'email' }))
})

test('an older account without a pending sign-in sends no event; signed out sends nothing', async () => {
	startInsight(production)
	const umami = tracker()
	render(withSession(null, <InsightIdentity />))
	const { unmount } = render(withSession({ id: 'old', createdAt: new Date('invalid') }, <InsightIdentity />))
	await waitFor(() => expect(umami.identify).toHaveBeenCalledWith(expect.any(String), { locale: 'en', signedIn: true }))
	expect(umami.track).not.toHaveBeenCalled()
	unmount()
	const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('denied')
	})
	render(withSession({ id: 'new', createdAt: new Date() }, <InsightIdentity />))
	await act(async () => {
		await new Promise(resolve => setTimeout(resolve, 20))
	})
	expect(umami.track).not.toHaveBeenCalled()
	get.mockRestore()
})

test('the privacy switch turns statistics off and back on', () => {
	render(withSession(null, <InsightPreference />))
	const box = screen.getByRole('checkbox', { name: 'Count my visits on this device' })
	expect((box as HTMLInputElement).checked).toBe(true)
	fireEvent.click(box)
	expect((box as HTMLInputElement).checked).toBe(false)
	expect(localStorage.getItem(optOutKey)).toBe('1')
	expect(script()).toBeNull()
	fireEvent.click(box)
	expect((box as HTMLInputElement).checked).toBe(true)
	expect(localStorage.getItem(optOutKey)).toBeNull()
})
