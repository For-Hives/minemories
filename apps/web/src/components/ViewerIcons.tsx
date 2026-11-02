import type { ReactNode } from 'react'

const paths = {
	atmosphere: (
		<>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
		</>
	),
	play: <path d="M8 5.5v13l11-6.5z" />,
	pause: <path d="M8 5v14M16 5v14" />,
	recenter: (
		<>
			<circle cx="12" cy="12" r="3" />
			<path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
		</>
	),
	person: (
		<>
			<circle cx="12" cy="7" r="3" />
			<path d="M6 20v-3a6 6 0 0 1 12 0v3" />
		</>
	),
	camera: (
		<>
			<path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
			<circle cx="12" cy="13" r="3.5" />
		</>
	),
	share: <path d="M7 17 17 7M9 7h8v8" />,
	refresh: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
	expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
	eye: (
		<>
			<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
			<circle cx="12" cy="12" r="2.8" />
		</>
	),
	eyeOff: (
		<path d="M3 3l18 18M10.6 6a8 8 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-3 3.6M6.3 7.6A15 15 0 0 0 2.5 12S6 18.1 12 18.1a8.4 8.4 0 0 0 3.2-.6" />
	),
} satisfies Record<string, ReactNode>

export type ViewerIconName = keyof typeof paths

export function ViewerIcon({ name }: { name: ViewerIconName }) {
	return (
		<svg
			className="cinema-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{paths[name]}
		</svg>
	)
}
