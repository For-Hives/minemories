import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { listKeyIndex, typeaheadIndex } from '../lib/site-menu'
import { useLayer } from './nav-layers'
import './site-select.css'

export interface SiteSelectOption<T extends string> {
	value: T
	label: string
}

const TYPEAHEAD_MS = 600

/**
 * The site's dropdown, in the look of the bar's menus: a stone button showing the chosen value, and a night panel listing the
 * choices (WAI-ARIA listbox, as the language picker: arrows, Home, End, typeahead, Enter or Space to choose, Escape or a press
 * outside to close, the focus back on the button). `name` adds a hidden field so a surrounding form still submits the value.
 */
export function SiteSelect<T extends string>({
	label,
	value,
	options,
	onChange,
	disabled = false,
	name,
	className = '',
}: {
	label: string
	value: T
	options: ReadonlyArray<SiteSelectOption<T>>
	onChange: (value: T) => void
	disabled?: boolean
	name?: string
	className?: string
}) {
	const id = useId()
	const root = useRef<HTMLDivElement>(null)
	const button = useRef<HTMLButtonElement>(null)
	const list = useRef<HTMLDivElement>(null)
	const typed = useRef({ text: '', at: 0 })
	const [open, setOpen] = useState(false)
	const selected = Math.max(
		0,
		options.findIndex(option => option.value === value)
	)
	const [active, setActive] = useState(selected)
	const labels = options.map(option => option.label)
	const close = (focus: boolean) => {
		setOpen(false)
		if (focus) button.current?.focus()
	}
	useLayer(open, close, [root])
	useEffect(() => {
		if (open) list.current?.focus({ preventScroll: true })
	}, [open])
	useEffect(() => {
		if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
	}, [open, active])
	useEffect(() => {
		// A disabled control cannot keep a list open under the pointer.
		if (disabled) setOpen(false)
	}, [disabled])
	const show = () => {
		setActive(selected)
		setOpen(true)
	}
	const choose = (index: number) => {
		const option = options[index]
		if (option && option.value !== value) onChange(option.value)
		close(true)
	}
	const typeahead = (key: string, at: number) => {
		const text = at - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key : key
		typed.current = { text, at }
		const found = typeaheadIndex(labels, text, active)
		if (found !== null) setActive(found)
	}
	const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Tab') {
			// Tab goes on from the button, as if the list had never opened (the list is not in the Tab order).
			button.current?.focus()
			setOpen(false)
			return
		}
		event.stopPropagation()
		const moved = listKeyIndex(event.key, active, labels.length)
		if (moved !== null) {
			event.preventDefault()
			setActive(moved)
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			choose(active)
		} else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey)
			typeahead(event.key, Date.now())
	}
	const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
		event.preventDefault()
		event.stopPropagation()
		show()
	}
	return (
		<div ref={root} className={`mm-select ${className}`.trim()} data-own-keys="">
			<span id={`${id}-label`} className="mm-select__label">
				{label}
			</span>
			<div className="mm-select__field">
				<button
					ref={button}
					type="button"
					className="mc-btn mc-btn--auto mm-select__button"
					aria-haspopup="listbox"
					aria-expanded={open}
					aria-controls={`${id}-list`}
					aria-labelledby={`${id}-label ${id}-value`}
					disabled={disabled}
					onClick={() => (open ? close(false) : show())}
					onKeyDown={onButtonKey}
				>
					<span id={`${id}-value`} className="mm-select__value">
						{options[selected]?.label}
					</span>
					<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
				</button>
				<div
					ref={list}
					id={`${id}-list`}
					className="mm-nav__panel mm-select__list"
					role="listbox"
					tabIndex={-1}
					aria-labelledby={`${id}-label`}
					aria-activedescendant={open ? `${id}-${active}` : undefined}
					hidden={!open}
					onKeyDown={onListKey}
				>
					{options.map((option, index) => (
						// biome-ignore lint/a11y/useKeyWithClickEvents: the list itself takes the keys (aria-activedescendant), as the listbox pattern wants.
						<div
							key={option.value}
							id={`${id}-${index}`}
							data-index={index}
							role="option"
							tabIndex={-1}
							aria-selected={option.value === value}
							className={index === active ? 'mm-select__option is-active' : 'mm-select__option'}
							onPointerMove={() => setActive(index)}
							onClick={() => choose(index)}
						>
							<span className="mc-icon mc-icon--check mm-select__check" aria-hidden="true" />
							{option.label}
						</div>
					))}
				</div>
			</div>
			{name && <input type="hidden" name={name} value={value} />}
		</div>
	)
}
