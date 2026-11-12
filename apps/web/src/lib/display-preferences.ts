/**
 * The root classes the whole site sets per locale: the Unifont class of the Korean and Japanese pages (`html.mm-cjk`). The readable font
 * and reduced motion options of the footer are gone (12 November 2026): their attributes are cleared, so nobody stays stuck with an
 * option they can no longer turn off, and the leftover `mcui-font` / `mcui-motion` keys are removed from this device.
 */

/** Locales whose characters the game's atlases do not draw (same list as lib/hero-i18n.ts). */
const unifontLocales = new Set(['ko', 'ja'])

/** Clears the retired display options and puts the script class of the locale on the root element. */
export function applyDisplay(root: Element, locale: string) {
	root.removeAttribute('data-mc-font')
	root.removeAttribute('data-mc-motion')
	root.classList.toggle('mm-cjk', unifontLocales.has(locale))
}
