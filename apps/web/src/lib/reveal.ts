/** Landing blocks that enter on scroll (design system: docs/features/design-system.md, motion rules). */
export const revealSelector = [
	'.mc-section__title',
	'.mc-section__text',
	'.mc-steps > .mc-step',
	'.site-links',
	'.mc-faq__item',
	'.mc-section .mc-hero__actions',
].join(',')

interface ObserverLike {
	observe(target: Element): void
	unobserve(target: Element): void
	disconnect(): void
}
type ObserverFactory = (callback: (entries: { isIntersecting: boolean; target: Element }[]) => void) => ObserverLike

const browserObserver: ObserverFactory = callback =>
	new IntersectionObserver(callback, { rootMargin: '0px 0px -8% 0px' })

/**
 * Sets up scroll entrances inside `root` (the #site container): a short offset and fade (transform and opacity, never a layout shift).
 * Does nothing, and hides nothing, when motion is reduced or IntersectionObserver is missing: content is visible by default.
 * Each block enters once; siblings entering together are staggered by --ds-stagger. Returns the function that undoes everything.
 */
export function observeReveal(
	root: HTMLElement,
	{
		reduced,
		createObserver = browserObserver,
		supported = typeof IntersectionObserver !== 'undefined',
	}: { reduced: boolean; createObserver?: ObserverFactory; supported?: boolean }
): () => void {
	if (reduced || !supported) return () => undefined
	const targets = [...root.querySelectorAll(revealSelector)]
	const observer = createObserver(entries => {
		let order = 0
		for (const entry of entries) {
			if (!entry.isIntersecting) continue
			;(entry.target as HTMLElement).style.setProperty('--ds-i', String(Math.min(order++, 4)))
			entry.target.classList.add('is-in')
			observer.unobserve(entry.target)
		}
	})
	for (const target of targets) {
		target.classList.add('ds-reveal')
		observer.observe(target)
	}
	root.dataset.reveal = 'on'
	return () => {
		observer.disconnect()
		delete root.dataset.reveal
		for (const target of targets) {
			target.classList.remove('ds-reveal', 'is-in')
			;(target as HTMLElement).style.removeProperty('--ds-i')
		}
	}
}
