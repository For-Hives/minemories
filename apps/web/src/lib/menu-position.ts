/** Opens at the pointer, flipping left or up when it would leave the viewport, never past a margin. */
export function menuPosition(
	point: { x: number; y: number },
	menu: { width: number; height: number },
	viewport: { width: number; height: number },
	margin = 8
) {
	const x = point.x + menu.width + margin > viewport.width ? point.x - menu.width : point.x
	const y = point.y + menu.height + margin > viewport.height ? point.y - menu.height : point.y
	return {
		x: Math.max(margin, Math.min(x, viewport.width - menu.width - margin)),
		y: Math.max(margin, Math.min(y, viewport.height - menu.height - margin)),
	}
}
