import { lazy } from 'react'
import { Navigate, Route } from 'react-router'
import { AdminLayout } from './components/AdminLayout'
import { Page } from './components/PageFrame'

const AdminHome = lazy(() => import('./pages/AdminHome').then(module => ({ default: module.AdminHome })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })))
const ModerationPage = lazy(() => import('./pages/PublicCatalog').then(module => ({ default: module.ModerationPage })))
const DiagnosticsPage = lazy(() =>
	import('./pages/DiagnosticsPage').then(module => ({ default: module.DiagnosticsPage }))
)

/** The administration routes (all private, behind a session): overview, accounts, moderation, diagnostics, and the old `/moderation` URL. */
export const adminRoutes = (
	<>
		<Route path="/admin" element={<AdminLayout />}>
			<Route
				index
				element={
					<Page>
						<AdminHome />
					</Page>
				}
			/>
			<Route
				path="users"
				element={
					<Page>
						<AdminPage />
					</Page>
				}
			/>
			<Route
				path="moderation"
				element={
					<Page>
						<ModerationPage />
					</Page>
				}
			/>
			<Route
				path="diagnostics"
				element={
					<Page>
						<DiagnosticsPage />
					</Page>
				}
			/>
		</Route>
		<Route path="/moderation" element={<Navigate to="/admin/moderation" replace />} />
	</>
)
