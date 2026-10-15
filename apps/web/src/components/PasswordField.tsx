import { useId, useState } from 'react'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

export function PasswordField({ creating, className }: { creating: boolean; className: string }) {
	const { copy, t } = useLocalizedCopy()
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
			<label htmlFor={id}>{t('Password')}</label>
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
					aria-controls={id}
					aria-label={copy(
						visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe',
						visible ? 'Hide password' : 'Show password'
					)}
					onClick={() => setVisible(!visible)}
				>
					{copy(visible ? 'Masquer' : 'Afficher', visible ? 'Hide' : 'Show')}
				</button>
			</div>
			<p id={`${id}-hint`} className="auth-field-hint">
				{copy(
					creating
						? '12 caractères minimum. Une phrase facile à retenir peut aider.'
						: 'Utilise le mot de passe de ton compte Minemories.',
					creating ? 'At least 12 characters. A memorable phrase can help.' : 'Use your Minemories account password.'
				)}
			</p>
			<p id={`${id}-caps`} role="status" className="auth-caps-warning">
				{capsLock ? copy('Verr. Maj est activé.', 'Caps Lock is on.') : ''}
			</p>
		</fieldset>
	)
}
