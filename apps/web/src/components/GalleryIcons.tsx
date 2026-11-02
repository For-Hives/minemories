import type { ReactNode } from 'react'

const paths = {
	view: (
		<>
			<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
			<circle cx="12" cy="12" r="2.8" />
		</>
	),
	link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
	globe: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
		</>
	),
	trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
	pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
	layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
	restore: <path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" />,
	close: <path d="M6 6l12 12M18 6 6 18" />,
	check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
	refresh: <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />,
	clock: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</>
	),
	pin: (
		<>
			<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
			<circle cx="12" cy="10" r="2.3" />
		</>
	),
	leaf: <path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7" />,
	cloud: <path d="M7 17h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 10.5 3.5 3.5 0 0 0 7 17zM9 20l-1 2M13 20l-1 2M17 20l-1 2" />,
	disk: (
		<>
			<ellipse cx="12" cy="6" rx="8" ry="3" />
			<path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
		</>
	),
	cube: <path d="m12 3 8.5 4.7v8.6L12 21l-8.5-4.7V7.7zM12 12l8.5-4.3M12 12v9M12 12 3.5 7.7" />,
} satisfies Record<string, ReactNode>

export type GalleryIconName = keyof typeof paths

export function GalleryIcon({ name }: { name: GalleryIconName }) {
	return (
		<svg
			className="gallery-icon"
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
