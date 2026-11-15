import type { RoleStorage, StorageRole } from '@minemories/api-contract'
import { type SyntheticEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { buttonDark, buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { gigabytesInput, parseGigabytes } from '../lib/storage-limits'

type Translate = ReturnType<typeof useI18n>['t']

/** One label per role of the contract: adding a role to `storageRole` fails the typecheck until it has one here. */
function roleLabels(t: Translate): Record<StorageRole, { name: string; holders: string }> {
	return {
		user: { name: t('User'), holders: t('Every account') },
		admin: { name: t('Admin'), holders: t('Administrators') },
	}
}
/** Edits one role's limit in decimal gigabytes, or removes it (the role then falls back to the base quota). */
export function RoleStorageDialog({
	row,
	onClose,
	onSuccess,
}: {
	row: RoleStorage
	onClose(): void
	onSuccess(): void
}) {
	const { t } = useI18n(),
		dialog = useRef<HTMLDialogElement>(null),
		input = useRef<HTMLInputElement>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(''),
		// Only a rejected value marks the field invalid; a failed save leaves the value as it was.
		[invalid, setInvalid] = useState(false),
		active = useRef(true),
		name = roleLabels(t)[row.role].name
	useEffect(() => {
		active.current = true
		const element = dialog.current
		element?.showModal()
		return () => {
			active.current = false
			element?.close()
		}
	}, [])
	async function save(quotaBytes: number | null) {
		setBusy(true)
		setError('')
		setInvalid(false)
		try {
			await apiClient.admin.setRoleStorage({ role: row.role, quotaBytes })
			if (active.current) onSuccess()
		} catch {
			if (active.current) setError(t('Could not save this limit. Try again.'))
		} finally {
			if (active.current) setBusy(false)
		}
	}
	function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		if (busy) return
		const bytes = parseGigabytes(String(new FormData(event.currentTarget).get('gigabytes') ?? ''))
		if (bytes === null) {
			setInvalid(true)
			setError(t('Enter a size in GB above 0 and up to 1000, for example 5 or 0.5.'))
			input.current?.focus()
			return
		}
		void save(bytes)
	}
	return (
		<dialog
			ref={dialog}
			className="mm-admin-dialog"
			aria-labelledby="role-storage-dialog-title"
			onCancel={event => {
				if (busy) event.preventDefault()
				else onClose()
			}}
		>
			<form onSubmit={submit} noValidate>
				<span className="mm-kicker">{t('Storage by role')}</span>
				<h2 id="role-storage-dialog-title">{t('Storage limit: {role}', { role: name })}</h2>
				<p>
					{t(
						'Applies at once to every account with this role. Lowering it deletes nothing: accounts above it can no longer upload until they free space.'
					)}
				</p>
				<label>
					{t('Limit in GB')}
					<input
						ref={input}
						name="gigabytes"
						inputMode="decimal"
						autoComplete="off"
						required
						// An unset role starts empty (its current size as a hint), so saving untouched never pins the default.
						defaultValue={row.limitBytes === null ? '' : gigabytesInput(row.limitBytes)}
						placeholder={String(Number((row.effectiveBytes / 1_000_000_000).toFixed(2)))}
						aria-describedby={invalid ? 'role-storage-hint role-storage-error' : 'role-storage-hint'}
						aria-invalid={invalid || undefined}
						disabled={busy}
					/>
				</label>
				<p id="role-storage-hint">{t('Decimal units: 1 GB = 1,000,000,000 bytes.')}</p>
				{error && (
					<p id="role-storage-error" role="alert" className="mm-admin-error">
						{error}
					</p>
				)}
				<div className="mm-admin-dialog-actions">
					<button type="button" className={`mm-admin-secondary ${buttonDark}`} onClick={onClose} disabled={busy}>
						{t('Cancel')}
					</button>
					{row.limitBytes !== null && (
						<button
							type="button"
							className={`mm-admin-secondary ${buttonDark}`}
							onClick={() => void save(null)}
							disabled={busy}
						>
							{t('Reset to default')}
						</button>
					)}
					<button type="submit" className={`mm-admin-primary ${buttonLime}`} disabled={busy}>
						{busy ? t('Saving…') : t('Save')}
					</button>
				</div>
			</form>
		</dialog>
	)
}
