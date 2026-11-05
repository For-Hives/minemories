import type { ReactNode } from 'react'

/** A small label in the game's font, with the ember square of the landing in front (docs/features/design-system.md). */
export function Eyebrow({ children, tone = '' }: { children: ReactNode; tone?: string }) {
	return (
		<span className={`mm-eyebrow ${tone}`}>
			<span aria-hidden="true" className="mm-eyebrow-mark" />
			{children}
		</span>
	)
}

// The buttons are the kit's (kit.css `.mc-btn`): the game's stone button, the copper one for the main action of a zone, a quiet one without relief for secondary actions.
export const buttonBase = 'mm-button mc-btn mc-btn--auto'
export const buttonDark = buttonBase
export const buttonLime = `${buttonBase} mc-btn--primary`
export const buttonOutline = `${buttonBase} mm-button-outline`
export const buttonQuiet = `${buttonBase} mm-button-quiet`
export const fileInputHidden = 'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]'
