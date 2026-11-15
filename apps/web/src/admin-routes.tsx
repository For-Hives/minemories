import { lazy } from 'react'
import { Navigate, Route } from 'react-router'
import { AdminLayout } from './components/AdminLayout'
import { Page } from './components/PageFrame'

const AdminPulse = lazy(() => import('./pages/admin/AdminPulse').then(module => ({ default: module.AdminPulse })))
const AdminAccounts = lazy(() =>
	import('./pages/admin/AdminAccounts').then(module => ({ default: module.AdminAccounts }))
)
const AdminModeration = lazy(() =>
	import('./pages/admin/AdminModeration').then(module => ({ default: module.AdminModeration }))
)
const AdminHealth = lazy(() => import('./pages/admin/AdminHealth').then(module => ({ default: module.AdminHealth })))
const AdminPlatform = lazy(() =>
	import('./pages/admin/AdminPlatform').then(module => ({ default: module.AdminPlatform }))
)

/** The administration routes (all private, behind a session): the pulse, accounts, moderation, health (diagnostics), the platform, and the old `/moderation` URL. */
export const adminRoutes = (
	<>
		<Route path="/admin" element={<AdminLayout />}>
			<Route
				index
				element={
					<Page>
						<AdminPulse />
					</Page>
				}
			/>
			<Route
				path="users"
				element={
					<Page>
						<AdminAccounts />
					</Page>
				}
			/>
			<Route
				path="moderation"
				element={
					<Page>
						<AdminModeration />
					</Page>
				}
			/>
			<Route
				path="diagnostics"
				element={
					<Page>
						<AdminHealth />
					</Page>
				}
			/>
			<Route
				path="platform"
				element={
					<Page>
						<AdminPlatform />
					</Page>
				}
			/>
		</Route>
		<Route path="/moderation" element={<Navigate to="/admin/moderation" replace />} />
	</>
)
