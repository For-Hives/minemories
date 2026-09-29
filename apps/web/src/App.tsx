import { createContext, lazy, type ReactNode, Suspense, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { type AuthSession, authClient } from './auth-client'
import { AuthPage } from './pages/AuthPage'
import { GalleryPage } from './pages/GalleryPage'
import { HomePage } from './pages/HomePage'

const ViewerPage = lazy(() => import('./pages/ViewerPage').then(module => ({ default: module.ViewerPage })))

interface AppContextValue {
	session: AuthSession | null
	isPending: boolean
	refreshSession: () => Promise<void>
	viewerFile: File | null
	setViewerFile: (file: File | null) => void
	notify: (message: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useAppContext() {
	const context = useContext(AppContext)
	if (!context) throw new Error('App context is unavailable.')
	return context
}

export function Eyebrow({ children, tone = 'text-[#b4c1ad]' }: { children: ReactNode; tone?: string }) {
	return (
		<span className={`font-mono text-[9px] font-medium tracking-[1.45px] ${tone}`}>
			<span aria-hidden="true" className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#94ad59]" />
			{children}
		</span>
	)
}

export const buttonBase =
	'inline-flex min-h-[46px] cursor-pointer items-center justify-center gap-[13px] rounded-[7px] border border-transparent px-[19px] text-xs font-bold no-underline transition hover:-translate-y-px disabled:transform-none disabled:cursor-wait disabled:opacity-[0.62]'
export const buttonDark = `${buttonBase} bg-forest text-[#f5f4eb] hover:bg-forest-dark`
export const buttonLime = `${buttonBase} bg-lime text-[#253121] shadow-[0_5px_18px_#5f70231b] hover:bg-[#e2ff7a]`
export const buttonOutline = `${buttonBase} border-[#354238] bg-transparent text-ink hover:border-forest hover:bg-[#2c3a30]`
export const buttonQuiet = `${buttonBase} min-h-[40px] bg-transparent px-[13px] text-[#b4c1ad] hover:bg-[#1c2720]`
export const fileInputHidden = 'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]'

export function App() {
	const { data, isPending, refetch } = authClient.useSession()
	const [viewerFile, setViewerFile] = useState<File | null>(null)
	const [notice, setNotice] = useState('')
	const context: AppContextValue = {
		session: data,
		isPending,
		refreshSession: async () => {
			await refetch()
		},
		viewerFile,
		setViewerFile,
		notify: setNotice,
	}

	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(''), 5200)
		return () => window.clearTimeout(timer)
	}, [notice])

	return (
		<AppContext.Provider value={context}>
			<BrowserRouter>
				<Routes>
					<Route element={<SiteLayout notice={notice} />}>
						<Route index element={<HomePage />} />
						<Route path="/login" element={<AuthPage mode="login" />} />
						<Route path="/register" element={<AuthPage mode="register" />} />
						<Route element={<RequireSession />}>
							<Route path="/gallery" element={<GalleryPage />} />
						</Route>
						<Route
							path="/viewer"
							element={
								<Suspense
									fallback={
										<div className="grid min-h-[55vh] place-items-center text-sm text-muted-ink">
											Loading the 3D viewer…
										</div>
									}
								>
									<ViewerPage />
								</Suspense>
							}
						/>
						<Route path="*" element={<Navigate to="/" replace />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</AppContext.Provider>
	)
}

function SiteLayout({ notice }: { notice: string }) {
	const { session, isPending, refreshSession, setViewerFile } = useAppContext()
	const navigate = useNavigate()
	let accountControl = (
		<Link className={`${buttonDark} max-phone:min-h-[37px] max-phone:px-[10px] max-phone:text-[10px]`} to="/login">
			Sign in
		</Link>
	)
	if (isPending)
		accountControl = (
			<span className="h-[30px] w-[75px] rounded-[20px] bg-[linear-gradient(90deg,#e7e6db,#f6f5ef,#e7e6db)]" />
		)
	else if (session)
		accountControl = (
			<div className="inline-flex items-center gap-[10px]">
				<Link
					className="inline-flex max-w-[175px] items-center gap-[9px] text-xs font-bold no-underline"
					to="/gallery"
					title={session.user.email}
				>
					<span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#1c2720] text-xs text-forest max-phone:h-[29px] max-phone:w-[29px]">
						{session.user.name.slice(0, 1).toUpperCase()}
					</span>
					<span className="overflow-hidden text-ellipsis whitespace-nowrap max-tablet:hidden">{session.user.name}</span>
				</Link>
				<button
					className="cursor-pointer border-0 bg-transparent px-0 py-[5px] text-[10px] text-[#b4c1ad] hover:text-[#e6eee1]"
					type="button"
					onClick={async () => {
						await authClient.signOut()
						await refreshSession()
						navigate('/')
					}}
				>
					Sign out
				</button>
			</div>
		)

	return (
		<div className="flex min-h-screen flex-col overflow-clip bg-paper text-ink">
			<header className="relative z-[4] mx-auto flex h-[88px] w-[min(100%-88px,1360px)] items-center border-b border-[#354238] max-tablet:w-[min(100%-48px,760px)] max-phone:h-[69px] max-phone:w-[calc(100%-36px)]">
				<Link
					className="inline-flex items-center gap-[11px] font-sans text-[19px] font-extrabold tracking-[-1.1px] text-ink no-underline max-phone:gap-2 max-phone:text-base"
					to="/"
					aria-label="Minemories, home"
				>
					<span className="grid h-[31px] w-[31px] -rotate-5 place-items-center rounded-[10px_10px_10px_4px] bg-lime font-sans text-[20px] font-extrabold text-forest-dark max-phone:h-[27px] max-phone:w-[27px] max-phone:text-[17px]">
						m
					</span>
					<span>minemories</span>
				</Link>
				<nav
					className="ml-[70px] flex items-center gap-8 max-tablet:ml-9 max-phone:hidden"
					aria-label="Main navigation"
				>
					<Link className="text-[13px] text-[#b4c1ad] no-underline transition-colors hover:text-forest" to="/">
						Home
					</Link>
					{session && (
						<Link className="text-[13px] text-[#b4c1ad] no-underline transition-colors hover:text-forest" to="/gallery">
							My gallery
						</Link>
					)}
				</nav>
				<div className="ml-auto flex items-center gap-3 max-phone:gap-[5px]">
					<label
						className={`${buttonQuiet} relative focus-within:outline-2 focus-within:outline-[#607a4a] focus-within:outline-offset-[3px] max-phone:h-[38px] max-phone:min-h-[38px] max-phone:w-[39px] max-phone:overflow-hidden max-phone:whitespace-nowrap max-phone:p-0 max-phone:text-[0px] max-phone:before:content-["＋"] max-phone:before:text-[19px]`}
					>
						Open a local GLB <span aria-hidden="true">↗</span>
						<input
							type="file"
							id="global-file-input"
							accept=".glb,model/gltf-binary"
							className={fileInputHidden}
							onChange={event => {
								const file = event.currentTarget.files?.[0]
								if (file) {
									setViewerFile(file)
									navigate('/viewer')
								}
								event.currentTarget.value = ''
							}}
						/>
					</label>
					{accountControl}
				</div>
			</header>
			<main className="w-full flex-1">
				<Outlet />
			</main>
			<footer className="mx-auto flex min-h-[78px] w-[min(100%-88px,1360px)] items-center justify-between border-t border-[#354238] text-[11px] text-[#b4c1ad] max-tablet:w-[min(100%-48px,760px)] max-phone:min-h-[67px] max-phone:w-[calc(100%-36px)] max-phone:gap-[9px] max-phone:text-[9px]">
				<Link
					className="inline-flex items-center gap-[11px] font-sans text-sm font-extrabold tracking-[-1.1px] text-ink no-underline max-phone:text-xs"
					to="/"
				>
					<span className="grid h-[25px] w-[25px] -rotate-5 place-items-center rounded-[7px_7px_7px_3px] bg-lime font-sans text-base font-extrabold text-forest-dark max-phone:h-[22px] max-phone:w-[22px]">
						m
					</span>{' '}
					minemories
				</Link>
				<span>Your worlds stay yours.</span>
				<span className="font-mono text-[9px] tracking-[0.2px] max-phone:hidden">
					Not affiliated with Mojang or Microsoft · Local opening
				</span>
			</footer>
			{notice && (
				<div
					className="fixed right-[30px] bottom-[26px] z-20 max-w-[360px] animate-toast-in rounded-lg border border-[#526b4c] bg-forest px-[19px] py-[15px] text-[13px] text-[#f3f4e9] shadow-[0_12px_35px_#1c2c2080] max-phone:right-3 max-phone:bottom-3 max-phone:left-3 max-phone:max-w-none max-phone:text-[11px]"
					role="status"
				>
					{notice}
				</div>
			)}
		</div>
	)
}

function RequireSession() {
	const { session, isPending } = useAppContext()
	const location = useLocation()
	if (isPending)
		return <div className="grid min-h-[55vh] place-items-center text-sm text-muted-ink">Loading your space…</div>
	if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
	return <Outlet />
}
