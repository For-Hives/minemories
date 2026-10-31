import { type MouseEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { menuPosition } from '../lib/menu-position'
import { GalleryIcon, type GalleryIconName } from './GalleryIcons'

export interface MenuItem {
	label: string
	icon: GalleryIconName
	onSelect: () => void
	danger?: boolean
}

interface OpenMenu {
	x: number
	y: number
	items: MenuItem[]
	label: string
}

/** Right-click (or the context-menu key) opens a small menu of the actions already offered on the element. */
export function useContextMenu() {
	const [menu, setMenu] = useState<OpenMenu | null>(null)
	const open = useCallback((event: MouseEvent<HTMLElement>, label: string, items: MenuItem[]) => {
		event.preventDefault()
		const keyboard = event.clientX === 0 && event.clientY === 0
		const rect = event.currentTarget.getBoundingClientRect()
		setMenu({
			x: keyboard ? rect.left + 16 : event.clientX,
			y: keyboard ? rect.top + 16 : event.clientY,
			items,
			label,
		})
	}, [])
	const close = useCallback(() => setMenu(null), [])
	const element = menu ? <ContextMenu menu={menu} onClose={close} /> : null
	return { open, element }
}

function ContextMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
	const list = useRef<HTMLDivElement>(null)
	const [position, setPosition] = useState({ x: menu.x, y: menu.y })
	useLayoutEffect(() => {
		const element = list.current
		if (!element) return
		setPosition(
			menuPosition(
				menu,
				{ width: element.offsetWidth, height: element.offsetHeight },
				{ width: window.innerWidth, height: window.innerHeight }
			)
		)
		element.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
	}, [menu])
	useEffect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
		const dismiss = (event: Event) => {
			if (!(event.target instanceof Node && list.current?.contains(event.target))) onClose()
		}
		window.addEventListener('pointerdown', dismiss, true)
		window.addEventListener('scroll', onClose, true)
		window.addEventListener('resize', onClose)
		return () => {
			window.removeEventListener('pointerdown', dismiss, true)
			window.removeEventListener('scroll', onClose, true)
			window.removeEventListener('resize', onClose)
			opener?.focus()
		}
	}, [onClose])
	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
		const index = items.indexOf(document.activeElement as HTMLElement)
		const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
		if (event.key === 'Escape' || event.key === 'Tab') {
			event.preventDefault()
			onClose()
		} else if (step) {
			event.preventDefault()
			items[(index + step + items.length) % items.length]?.focus()
		}
	}
	return createPortal(
		<div
			ref={list}
			className="context-menu"
			role="menu"
			aria-label={menu.label}
			style={{ left: position.x, top: position.y }}
			onKeyDown={onKeyDown}
			onContextMenu={event => event.preventDefault()}
		>
			{menu.items.map(item => (
				<button
					key={item.label}
					type="button"
					role="menuitem"
					data-danger={item.danger}
					onClick={() => {
						onClose()
						item.onSelect()
					}}
				>
					<GalleryIcon name={item.icon} />
					{item.label}
				</button>
			))}
		</div>,
		document.body
	)
}
