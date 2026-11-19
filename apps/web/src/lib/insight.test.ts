import { describe, expect, it } from 'vitest'
import {
	browserRefuses,
	cleanPayload,
	cleanReferrer,
	cleanUrl,
	countBucket,
	defaultWebsiteId,
	distinctId,
	insightRoute,
	insightSettings,
	isNewAccount,
	joinedMonth,
	modDownload,
	outboundHost,
} from './insight'

const origin = 'https://minemories.net'

describe('insightRoute', () => {
	it('replaces share tokens and public ids, language prefix kept', () => {
		expect(insightRoute('/share/abcDEF123_-xyz')).toEqual({
			path: '/share/:token',
			page: '/share/:token',
			excluded: false,
			privateTitle: true,
		})
		expect(insightRoute('/fr/public/0f0f0f0f-0000-4000-8000-000000000000').path).toBe('/fr/public/:id')
		expect(insightRoute('/fr').path).toBe('/fr')
		expect(insightRoute('/').path).toBe('/')
	})
	it('excludes operator pages and flags private titles', () => {
		expect(insightRoute('/admin/accounts').excluded).toBe(true)
		expect(insightRoute('/de/moderation').excluded).toBe(true)
		expect(insightRoute('/gallery').privateTitle).toBe(true)
		expect(insightRoute('/faq').privateTitle).toBe(false)
	})
})

describe('cleanUrl', () => {
	it('keeps campaign parameters only and drops the fragment', () => {
		expect(cleanUrl(`${origin}/share/secret?utm_source=discord&cam=1,2,3&UTM_Campaign=x#top`, origin)).toBe(
			`${origin}/share/:token?utm_source=discord&UTM_Campaign=x`
		)
		expect(cleanUrl('/viewer?memory=abc', origin)).toBe('/viewer')
		expect(cleanUrl('/faq?gclid=1&ref=reddit', origin)).toBe('/faq?gclid=1&ref=reddit')
	})
	it('refuses excluded pages and unreadable values', () => {
		expect(cleanUrl(`${origin}/admin`, origin)).toBeNull()
		expect(cleanUrl('http://[bad', origin)).toBeNull()
	})
})

describe('cleanReferrer', () => {
	it('cleans the site’s own pages and trims other sites to origin and path', () => {
		expect(cleanReferrer('/share/secret?x=1', origin)).toBe('/share/:token')
		expect(cleanReferrer('https://www.reddit.com/r/Minecraft/?utm=1#c', origin)).toBe(
			'https://www.reddit.com/r/Minecraft/'
		)
		expect(cleanReferrer(`${origin}/admin`, origin)).toBe('')
		expect(cleanReferrer(undefined, origin)).toBe('')
		expect(cleanReferrer('http://[bad', origin)).toBe('')
	})
})

describe('cleanPayload', () => {
	it('cleans a pageview of a private page', () => {
		expect(
			cleanPayload(
				'event',
				{ url: `${origin}/share/secret?view=1`, title: 'My base', referrer: '/public/x', website: 'w' },
				origin
			)
		).toEqual({
			url: `${origin}/share/:token`,
			title: 'Minemories /share/:token',
			referrer: '/public/:id',
			website: 'w',
		})
	})
	it('keeps public titles, cleans a non-string referrer, leaves errors’ fields', () => {
		expect(
			cleanPayload('event', { url: `${origin}/faq`, title: 'FAQ', referrer: 3 as unknown as string }, origin)
		).toEqual({
			url: `${origin}/faq`,
			title: 'FAQ',
			referrer: '',
		})
		expect(cleanPayload('error', { url: '/share/secret', message: 'boom' }, origin)).toEqual({
			url: '/share/:token',
			message: 'boom',
		})
		expect(cleanPayload('identify', { data: { a: 1 } }, origin)).toEqual({ data: { a: 1 } })
	})
	it('drops excluded pages and malformed payloads', () => {
		expect(cleanPayload('event', { url: `${origin}/admin` }, origin)).toBeNull()
		expect(cleanPayload('event', null as never, origin)).toBeNull()
	})
})

describe('session helpers', () => {
	it('buckets counts', () => {
		expect([Number.NaN, 0, 1, 4, 12, 50, 500].map(countBucket)).toEqual([
			'0',
			'0',
			'1',
			'2-5',
			'6-20',
			'21-100',
			'100+',
		])
	})
	it('derives the joining month and new accounts', () => {
		expect(joinedMonth('2026-11-19T10:00:00Z')).toBe('2026-11')
		expect(joinedMonth(undefined)).toBeUndefined()
		expect(joinedMonth('nope')).toBeUndefined()
		const now = Date.parse('2026-11-19T10:05:00Z')
		expect(isNewAccount('2026-11-19T10:00:00Z', now)).toBe(true)
		expect(isNewAccount(new Date('2026-11-19T09:00:00Z'), now)).toBe(false)
		expect(isNewAccount('2026-11-19T11:00:00Z', now)).toBe(false)
		expect(isNewAccount(undefined, now)).toBe(false)
	})
	it('makes a stable pseudonym that is not the account id', async () => {
		const id = await distinctId('user-1')
		expect(id).toMatch(/^u[0-9a-f]{31}$/)
		expect(await distinctId('user-1')).toBe(id)
		expect(await distinctId('user-2')).not.toBe(id)
	})
})

describe('links', () => {
	it('finds other sites', () => {
		expect(outboundHost('https://www.curseforge.com/minecraft/mc-mods/x', origin)).toBe('curseforge.com')
		expect(outboundHost('/faq', origin)).toBeNull()
		expect(outboundHost('mailto:a@b.c', origin)).toBeNull()
		expect(outboundHost('http://[bad', origin)).toBeNull()
	})
	it('reads mod JAR links', () => {
		const api = 'https://api.minemories.net'
		expect(modDownload(`${api}/downloads/1.21.1-fabric/latest`, api)).toEqual({
			target: '1.21.1-fabric',
			version: 'latest',
		})
		expect(modDownload(`${api}/downloads/a%20b/0.39.1-beta.1`, api)).toEqual({
			target: 'a b',
			version: '0.39.1-beta.1',
		})
		expect(modDownload(`${api}/downloads/index.json`, api)).toBeNull()
		expect(modDownload('https://example.com/downloads/a/b', api)).toBeNull()
		expect(modDownload('/relative', api)).toBeNull()
	})
	it('respects browser refusals', () => {
		expect(browserRefuses({ globalPrivacyControl: true })).toBe(true)
		expect(browserRefuses({ doNotTrack: '1' })).toBe(true)
		expect(browserRefuses({ doNotTrack: 'yes' })).toBe(true)
		expect(browserRefuses({ doNotTrack: null })).toBe(false)
	})
})

describe('insightSettings', () => {
	it('uses the production website through the API', () => {
		expect(insightSettings({ PROD: true, MODE: 'production', VITE_API_URL: 'https://api.minemories.net/' })).toEqual({
			websiteId: defaultWebsiteId,
			hostUrl: 'https://api.minemories.net/api/insight',
			domains: ['minemories.net'],
			release: 'dev',
			environment: 'production',
		})
	})
	it('is off in development unless configured, and on demand', () => {
		expect(insightSettings({ PROD: false, MODE: 'development' })).toBeNull()
		expect(insightSettings({ PROD: true, VITE_INSIGHT_WEBSITE_ID: 'off' })).toBeNull()
		expect(
			insightSettings({
				VITE_INSIGHT_WEBSITE_ID: ' site ',
				VITE_SITE_URL: 'http://localhost:5173',
				VITE_RELEASE: 'abc',
			})
		).toEqual({
			websiteId: 'site',
			hostUrl: 'http://localhost:3001/api/insight',
			domains: ['localhost'],
			release: 'abc',
			environment: 'development',
		})
		expect(insightSettings({ VITE_INSIGHT_WEBSITE_ID: 'site', MODE: 'staging' })?.environment).toBe('staging')
		expect(insightSettings({ VITE_INSIGHT_WEBSITE_ID: 'site', VITE_SITE_URL: 'not a url' })).toBeNull()
	})
})
