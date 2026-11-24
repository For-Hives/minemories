import { type ReactNode, useId, useState } from 'react'
import { useI18n } from '../i18n/I18n'

/** `creating` asks for a new password (12 characters at least); `hint` replaces the line under the field. */
export function PasswordField({
	creating,
	className,
	hint,
	label = 'Password',
}: {
	creating: boolean
	className: string
	hint?: ReactNode
	label?: string
}) {
	const { t } = useI18n()
	const id = useId()
	const [visible, setVisible] = useState(false)
	const [capsLock, setCapsLock] = useState(false)
	return (
		<fieldset
			className="auth-password"
			onBlur={event => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setVisible(false)
					setCapsLock(false)
				}
			}}
		>
			<label htmlFor={id}>{t(label)}</label>
			<div className="auth-password-control">
				<input
					id={id}
					name="password"
					type={visible ? 'text' : 'password'}
					autoComplete={creating ? 'new-password' : 'current-password'}
					minLength={creating ? 12 : undefined}
					required
					className={className}
					aria-describedby={`${id}-hint ${id}-caps`}
					autoCapitalize="none"
					spellCheck={false}
					onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))}
					onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))}
				/>
				<button
					type="button"
					className="auth-reveal mc-btn"
					aria-controls={id}
					aria-label={t(visible ? 'Hide password' : 'Show password')}
					onClick={() => setVisible(!visible)}
				>
					{t(visible ? 'Hide' : 'Show')}
				</button>
			</div>
			<p id={`${id}-hint`} className="auth-field-hint">
				{hint ?? (creating ? t('At least 12 characters. A memorable phrase can help.') : null)}
			</p>
			<p id={`${id}-caps`} role="status" className="auth-caps-warning">
				{capsLock ? t('Caps Lock is on.') : ''}
			</p>
		</fieldset>
	)
}
