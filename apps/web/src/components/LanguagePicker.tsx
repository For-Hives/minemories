import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18n'
import { localeCode, pickerLocales } from '../lib/locale-picker'
import { listKeyIndex, typeaheadIndex } from '../lib/site-menu'
import { useLayer } from './nav-layers'

/** The picker's order (lib/locale-picker.ts): by each language's own name, its regions together. */
const options = pickerLocales()
const labels = options.map(option => option.label)
const TYPEAHEAD_MS = 600

/**
 * The language picker of the bar and of the phones' panel: a button that opens a list of every language under its own name (WAI-ARIA
 * listbox: arrows, Home, End, typeahead, Enter or Space to choose, Escape or a press outside to close, the focus back on the button).
 * The list is in the page, closed, from the prerender on. `compact`: the bar's button, which shows the language's code alone where the
 * menus leave little room (site-nav.css); its accessible name keeps the whole name.
 */
export function LanguagePicker({
	className = '',
	compact = false,
	name,
}: {
	className?: string
	compact?: boolean
	/** A fixed id base for a picker in the prerendered markup: React's generated ids differ between the prerender's tree and the hydrated one. */
	name?: string
}) {
	const { locale, pendingLocale, setLocale, localeError, t } = useI18n()
	const generated = useId()
	const id = name ?? generated
	const root = useRef<HTMLDivElement>(null)
	const button = useRef<HTMLButtonElement>(null)
	const list = useRef<HTMLDivElement>(null)
	const typed = useRef({ text: '', at: 0 })
	const [open, setOpen] = useState(false)
	const current = pendingLocale ?? locale
	const selected = Math.max(
		0,
		options.findIndex(option => option.id === current)
	)
	const [active, setActive] = useState(selected)
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
	const show = () => {
		setActive(selected)
		setOpen(true)
	}
	const choose = (index: number) => {
		const option = options[index]
		if (option && option.id !== current) setLocale(option.id)
		close(true)
	}
	const typeahead = (key: string, at: number) => {
		const text = at - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key : key
		typed.current = { text, at }
		const found = typeaheadIndex(labels, text, active)
		if (found !== null) setActive(found)
	}
	const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const moved = listKeyIndex(event.key, active, labels.length)
		if (event.key === 'Tab') {
			// From the button, Tab goes on as if the list had never opened (the list is not in the Tab order).
			button.current?.focus()
			setOpen(false)
			return
		}
		event.stopPropagation()
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
	const option = options[selected]
	return (
		<div ref={root} className={`mm-lang ${className}`.trim()} data-own-keys="">
			<span id={`${id}-label`} hidden>
				{t('Language')}
			</span>
			<button
				ref={button}
				type="button"
				className="mc-btn mc-btn--auto mm-lang__button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={`${id}-list`}
				aria-labelledby={`${id}-label ${id}-value`}
				aria-busy={pendingLocale !== null}
				onClick={() => (open ? close(false) : show())}
				onKeyDown={onButtonKey}
			>
				<span className="mm-lang__globe" aria-hidden="true" />
				<span id={`${id}-value`} className="mm-lang__name" lang={option?.tag}>
					{option?.label}
				</span>
				{compact && option && (
					<span className="mm-lang__code" aria-hidden="true">
						{localeCode(option.tag)}
					</span>
				)}
				<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
			</button>
			<div
				ref={list}
				id={`${id}-list`}
				className="mm-lang__list mm-nav__panel"
				role="listbox"
				tabIndex={-1}
				aria-labelledby={`${id}-label`}
				aria-activedescendant={open ? `${id}-${active}` : undefined}
				hidden={!open}
				onKeyDown={onListKey}
			>
				{options.map((entry, index) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: the list itself takes the keys (aria-activedescendant), as the listbox pattern wants.
					<div
						key={entry.id}
						id={`${id}-${index}`}
						data-index={index}
						role="option"
						tabIndex={-1}
						lang={entry.tag}
						aria-selected={entry.id === current}
						className={index === active ? 'mm-lang__option is-active' : 'mm-lang__option'}
						onPointerMove={() => setActive(index)}
						onClick={() => choose(index)}
					>
						<span className="mc-icon mc-icon--check mm-lang__check" aria-hidden="true" />
						{entry.label}
					</div>
				))}
			</div>
			{localeError && (
				<span role="alert" className="mm-lang__error">
					{t('Could not load this language. Select it again to retry.')}
				</span>
			)}
		</div>
	)
}
