/**
 * The display options of the whole site (the landing's footer offers them first): the readable font and reduced motion, kept on this device under the kit's keys
 * (`mcui-font`, `mcui-motion`, read before the first paint by hero/first-paint.js), and the Unifont class of the Korean and Japanese pages (`html.mm-cjk`).
 */
export type DisplayOption = 'font' | 'motion'

const keys: Record<DisplayOption, string> = { font: 'mcui-font', motion: 'mcui-motion' }
const attributes: Record<DisplayOption, [name: string, value: string]> = {
	font: ['data-mc-font', 'read'],
	motion: ['data-mc-motion', 'reduced'],
}
/** Locales whose characters the game's atlases do not draw (same list as lib/hero-i18n.ts). */
const unifontLocales = new Set(['ko', 'ja'])

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

export function readDisplayOption(storage: Storage | undefined, option: DisplayOption) {
	try {
		return storage?.getItem(keys[option]) === '1'
	} catch {
		return false
	}
}

export function storeDisplayOption(storage: Storage | undefined, option: DisplayOption, on: boolean) {
	try {
		storage?.setItem(keys[option], on ? '1' : '0')
	} catch {
		// Private mode or blocked storage: the option still applies to this page.
	}
}

export function setDisplayOption(root: Element, option: DisplayOption, on: boolean) {
	const [name, value] = attributes[option]
	if (on) root.setAttribute(name, value)
	else root.removeAttribute(name)
}

/** Puts the stored options and the script class of the locale on the root element. */
export function applyDisplay(root: Element, storage: Storage | undefined, locale: string) {
	for (const option of ['font', 'motion'] as const) setDisplayOption(root, option, readDisplayOption(storage, option))
	root.classList.toggle('mm-cjk', unifontLocales.has(locale))
}
