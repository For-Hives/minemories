import type { ReactNode } from 'react'

export function Eyebrow({ children, tone = 'text-[#b4c1ad]' }: { children: ReactNode; tone?: string }) {
	return (
		<span className={`font-mono text-[9px] font-medium tracking-[1.45px] ${tone}`}>
			<span aria-hidden="true" className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-[#94ad59]" />
			{children}
		</span>
	)
}

export const buttonBase =
	'mm-button inline-flex min-h-[46px] cursor-pointer items-center justify-center gap-[13px] rounded-[7px] border border-transparent px-[19px] text-xs font-bold no-underline transition hover:-translate-y-px disabled:transform-none disabled:cursor-wait disabled:opacity-[0.62]'
export const buttonDark = `${buttonBase} bg-forest text-[#f5f4eb] hover:bg-forest-dark`
export const buttonLime = `${buttonBase} bg-lime text-[#253121] shadow-[0_5px_18px_#5f70231b] hover:bg-[#f3dba9]`
export const buttonOutline = `${buttonBase} border-[#354238] bg-transparent text-ink hover:border-forest hover:bg-[#2c3a30]`
export const buttonQuiet = `${buttonBase} min-h-[40px] bg-transparent px-[13px] text-[#b4c1ad] hover:bg-[#1c2720]`
export const fileInputHidden = 'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]'
