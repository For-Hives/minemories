/** Blocs de la landing qui entrent au défilement (charte : docs/features/design-system.md, règles de mouvement). */
export const revealSelector = [
	'.mc-section__title',
	'.mc-section__text',
	'.mc-steps > .mc-step',
	'.mc-limits',
	'.site-links',
	'.mc-faq__item',
	'.mc-section .mc-hero__actions',
	'.footer .mc-footer__inner',
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
 * Prépare l'entrée au défilement dans `root` (le conteneur #site) : décalage et fondu courts (transform et opacité, jamais de saut de mise en page).
 * Sans effet, et rien n'est masqué, si le mouvement est réduit ou si IntersectionObserver n'existe pas : le contenu est visible par défaut.
 * Chaque bloc entre une fois ; les frères qui entrent ensemble sont décalés de --ds-stagger. Renvoie la fonction qui défait tout.
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
