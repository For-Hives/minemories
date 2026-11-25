import type { SyntheticEvent } from 'react'
import { Link } from 'react-router'
import { buttonDark, buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'

/**
 * Who the account is, at the top of My account: the avatar (a button that opens the avatar dialog), the name with its
 * inline edit, the email under it. The name has one place on the page, so there is never a second "name" to tell apart.
 */
export function AccountProfile({
	name,
	email,
	avatar,
	editingName,
	signsInWithName,
	pending,
	pendingName,
	onAvatar,
	onEditName,
	onCancelName,
	onSaveName,
}: {
	name: string
	email: string
	avatar: string | null
	editingName: boolean
	/** With a password, the name is also the sign-in name: a Minecraft name (3 to 16 letters, numbers or _). */
	signsInWithName: boolean
	pending: boolean
	pendingName: boolean
	onAvatar(): void
	onEditName(): void
	onCancelName(): void
	onSaveName(event: SyntheticEvent<HTMLFormElement>): void
}) {
	const { t } = useI18n()
	return (
		<header className="mm-account-heading">
			<span className="mm-kicker">MINEMORIES / {t('MY ACCOUNT')}</span>
			<div className="mm-account-profile">
				<button
					type="button"
					className="mm-account-avatar-button"
					aria-label={t('Change avatar')}
					disabled={pending}
					onClick={onAvatar}
				>
					<span className="mm-avatar-preview" aria-hidden="true">
						{name.slice(0, 1).toUpperCase()}
						{avatar && <img src={avatar} alt="" width={128} height={128} />}
					</span>
					<span className="mm-account-avatar-badge" aria-hidden="true">
						✎
					</span>
				</button>
				<div className="mm-account-identity">
					{editingName ? (
						<form className="mm-account-name-form" aria-label={t('Display name')} onSubmit={onSaveName}>
							<input
								className="mc-field"
								name="name"
								aria-label={t('Display name')}
								autoComplete="nickname"
								defaultValue={name}
								required
								minLength={signsInWithName ? 3 : 1}
								maxLength={signsInWithName ? 16 : 80}
								pattern={signsInWithName ? '\\w{3,16}' : undefined}
								spellCheck={false}
								disabled={pending}
								// biome-ignore lint/a11y/noAutofocus: the field replaces the button the person just pressed.
								autoFocus
								onKeyDown={event => {
									if (event.key === 'Escape') onCancelName()
								}}
							/>
							<div className="mm-account-name-actions">
								<button className={buttonLime} type="submit" disabled={pending}>
									{pendingName ? t('Saving…') : t('Save')}
								</button>
								<button className={buttonDark} type="button" disabled={pending} onClick={onCancelName}>
									{t('Cancel')}
								</button>
							</div>
							{signsInWithName && (
								<p className="mm-account-hint">{t('A Minecraft name has 3 to 16 letters, numbers or _.')}</p>
							)}
						</form>
					) : (
						<div className="mm-account-name">
							<h1>{name}</h1>
							<button type="button" className="mm-account-link" disabled={pending} onClick={onEditName}>
								{t('Edit name')}
							</button>
						</div>
					)}
					<p>{email}</p>
					{signsInWithName && <p className="mm-account-hint">{t('You sign in with this name or your email.')}</p>}
					<Link to="/gallery">← {t('Back to my gallery')}</Link>
				</div>
			</div>
		</header>
	)
}
