import type { AdminInsights, AdminSummary } from '@minemories/api-contract'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiClient } from '../../api-client'
import type { AdminAccess } from '../admin-access'

export const PERIODS = ['24h', '7d', '30d'] as const
export type Period = (typeof PERIODS)[number]
export const periodHours: Record<Period, number> = { '24h': 24, '7d': 168, '30d': 720 }
export const parsePeriod = (value: string | null): Period => PERIODS.find(period => period === value) ?? '30d'

/** What the console loads once for every page: the hourly series (two 30-day windows, so a period can be compared with the one before), the usage insights, and the two work queues. */
export type ConsoleData = {
	summary: AdminSummary | null
	insights: AdminInsights | null
	queue: { pending: number; reported: number } | null
	openIssues: { count: number; more: boolean } | null
	/** Accounts, bytes in use and accounts at 90 % of their own quota, over every account. */
	overview: { accounts: number; usedBytes: number; nearQuotaAccounts: number } | null
	updatedAt: number | null
	/** Counts completed loads, so a page can reload its own data when the header's Refresh is pressed. */
	loads: number
	loading: boolean
}
const empty: ConsoleData = {
	summary: null,
	insights: null,
	queue: null,
	openIssues: null,
	overview: null,
	updatedAt: null,
	loads: 0,
	loading: true,
}
const settled = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null)

export function useConsoleData(access: AdminAccess) {
	const [data, setData] = useState<ConsoleData>(empty)
	const [revision, setRevision] = useState(0)
	const { ready, admin, moderator, operator } = access
	useEffect(() => {
		if (!ready) return
		const controller = new AbortController()
		const options = { signal: controller.signal }
		setData(previous => ({ ...previous, loading: true }))
		void Promise.allSettled([
			admin ? apiClient.admin.summary({ hours: 1440 }, options) : Promise.reject(new Error('skipped')),
			admin ? apiClient.admin.insights(undefined, options) : Promise.reject(new Error('skipped')),
			moderator ? apiClient.discovery.queueSummary(undefined, options) : Promise.reject(new Error('skipped')),
			operator ? apiClient.diagnostics.list({ state: 'open', page: 0 }, options) : Promise.reject(new Error('skipped')),
			admin
				? apiClient.admin.users({ query: '', role: 'all', page: 1 }, options)
				: Promise.reject(new Error('skipped')),
		]).then(([summary, insights, queue, issues, users]) => {
			if (controller.signal.aborted) return
			const list = settled(issues)
			setData(previous => ({
				summary: settled(summary),
				insights: settled(insights),
				queue: settled(queue),
				openIssues: list ? { count: list.items.length, more: list.hasMore } : null,
				overview: settled(users)?.overview ?? null,
				updatedAt: Date.now(),
				loads: previous.loads + 1,
				loading: false,
			}))
		})
		return () => controller.abort()
	}, [ready, admin, moderator, operator, revision])
	const reload = useCallback(() => setRevision(value => value + 1), [])
	return { data, reload }
}

export type Console = {
	access: AdminAccess
	period: Period
	hours: number
	setPeriod(period: Period): void
	compare: boolean
	setCompare(compare: boolean): void
	data: ConsoleData
	reload(): void
}
export const ConsoleContext = createContext<Console | null>(null)
export function useConsole(): Console {
	const value = useContext(ConsoleContext)
	if (!value) throw new Error('useConsole needs the administration layout')
	return value
}
