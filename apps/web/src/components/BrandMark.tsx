/* The Minemories logo (design/logo/, built by `bun run brand:icons`): a pixel-art camera on its tripod. Both images are decorative where they are used: the word Minemories or the page title sits next to them. */

/**
 * `solo`: the whole logo, camera on its tripod, alone without the word in the site header and the landing bar (56 px tall, kit.css `.mm-brand-mark--solo`; the link keeps its aria-label).
 * Otherwise the camera's head alone, square: the small mark in front of the word Minemories (footer), at the size of the ember icon it replaced (8 game pixels, kit.css `.mm-brand-mark`).
 */
export function BrandMark({ solo = false }: { solo?: boolean }) {
	return (
		<img
			className={solo ? 'mm-brand-mark mm-brand-mark--solo' : 'mm-brand-mark'}
			src={solo ? '/brand/minemories-logo.svg' : '/brand/minemories-mark.svg'}
			alt=""
			width={solo ? 35 : 16}
			height={solo ? 56 : 16}
			decoding="async"
		/>
	)
}

/** The whole logo, camera and tripod (584 × 938): the large brand visual of the content pages' header. */
export function BrandLogo({ className = '' }: { className?: string }) {
	return (
		<img
			className={`mm-brand-logo ${className}`.trim()}
			src="/brand/minemories-logo.svg"
			alt=""
			width="584"
			height="938"
			decoding="async"
		/>
	)
}
