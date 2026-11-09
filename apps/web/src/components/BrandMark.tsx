/* The Minemories logo (design/logo/, built by `bun run brand:icons`): a pixel-art camera on its tripod. Both images are decorative where they are used: the word Minemories or the page title sits next to them. */

/** The camera's head alone, square: the mark in front of the word Minemories (site header, landing bar, footer). Its size is the ember icon's it replaced (8 game pixels, kit.css `.mm-brand-mark`). */
export function BrandMark() {
	return (
		<img className="mm-brand-mark" src="/brand/minemories-mark.svg" alt="" width="16" height="16" decoding="async" />
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
