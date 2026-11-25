import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { cloudScheduleCents, defaultQuote, parseSavedQuote, quotePrice, quoteStorageKey } from '../content/pricing'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
export function PricingPage() {
	const { t } = useI18n()
	return (
		<ContentLayout
			title={t('Pricing')}
			lead={t('€2 per memory. Online storage costs €6 the first year, then less each year, down to €3.')}
		>
			<p className="mm-release-label">{t('Not open yet: nothing can be paid for now.')}</p>
			<div className="mm-plan-grid">
				<section className="mm-plan">
					<h2>{t('Memory')}</h2>
					<p className="mm-big-price">
						2 € <span>{t('/ memory')}</span>
					</p>
					<p>{t('Paid once, when you take it.')}</p>
					<ul>
						<li>{t('Online storage is optional')}</li>
						<li>{t('The file stays on your computer too')}</li>
					</ul>
				</section>
				<section className="mm-plan mm-plan-featured">
					<h2>{t('Online storage')}</h2>
					<p className="mm-big-price">
						6 <span>→</span> 3 € <span>{t('/ year')}</span>
					</p>
					<p>{t('Per memory. It costs less each year, then €3 a year from the fourth.')}</p>
					<ol className="mm-price-steps">
						{cloudScheduleCents.map((cents, index) => (
							<li key={cents}>
								<span>
									{t('Year')} {index + 1}
									{index === 3 ? '+' : ''}
								</span>
								<strong>{cents / 100} €</strong>
							</li>
						))}
					</ol>
				</section>
			</div>
			<PriceSimulator />
			<div className="mm-prose">
				<h2>{t('For now')}</h2>
				<p>
					{t('Install the mod, take a memory and find it in your gallery. Paid storage isn’t open yet.')}{' '}
					{t('A memory isn’t a backup of your world.')}
				</p>
			</div>
			<div className="mm-actions">
				<Link to="/installation" className={buttonLime}>
					{t('Install the mod')}
				</Link>
				<Link to="/terms" className={buttonOutline}>
					{t('Terms')}
				</Link>
			</div>
		</ContentLayout>
	)
}
export function PriceSimulator() {
	const { locale, t } = useI18n()
	const [snapshots, setSnapshots] = useState(String(defaultQuote.snapshots))
	const [years, setYears] = useState(defaultQuote.years)
	const [cloud, setCloud] = useState(defaultQuote.cloud)
	const [saved, setSaved] = useState('')
	useEffect(() => {
		try {
			const input = parseSavedQuote(localStorage.getItem(quoteStorageKey))
			setSnapshots(String(input.snapshots))
			setYears(input.years)
			setCloud(input.cloud)
		} catch {
			/* Local storage is optional. */
		}
	}, [])
	const count = Number(snapshots)
	const valid = Number.isSafeInteger(count) && count >= 1 && count <= 100
	const quote = valid ? quotePrice({ snapshots: count, years, cloud }) : null
	const money = (cents: number) =>
		new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
	function save() {
		if (!valid) return
		try {
			localStorage.setItem(quoteStorageKey, JSON.stringify({ snapshots: count, years, cloud }))
			setSaved(t('Saved on this device. Nothing was bought.'))
		} catch {
			setSaved(t('Your browser can’t save it, but the estimate stays on screen.'))
		}
	}
	return (
		<section id="simulator" className="mm-price-simulator" aria-labelledby="simulator-title">
			<div>
				<h2 id="simulator-title">{t('Estimate a price')}</h2>
				<div className="mm-simulator-fields">
					<label htmlFor="snapshot-count">{t('Number of memories')}</label>
					<input
						id="snapshot-count"
						type="number"
						min="1"
						max="100"
						step="1"
						value={snapshots}
						aria-invalid={!valid}
						aria-describedby={!valid ? 'count-error' : undefined}
						onChange={event => {
							setSnapshots(event.target.value)
							setSaved('')
						}}
					/>
					{!valid && (
						<p role="alert" id="count-error">
							{t('Choose a whole number between 1 and 100.')}
						</p>
					)}
					<label className="mm-checkbox">
						<input
							type="checkbox"
							checked={cloud}
							onChange={event => {
								setCloud(event.target.checked)
								setSaved('')
							}}
						/>
						{t('Add online storage')}
					</label>
					<label htmlFor="storage-years">
						{t('Storage length')} : {years} {t('year(s)')}
					</label>
					<input
						id="storage-years"
						type="range"
						min="1"
						max="10"
						value={years}
						disabled={!cloud}
						onChange={event => {
							setYears(Number(event.target.value))
							setSaved('')
						}}
					/>
				</div>
			</div>
			<div className="mm-estimate">
				<output className="mm-estimate-total" aria-live="polite" aria-label={t('Estimated total')}>
					{quote ? money(quote.totalCents) : '-'}
				</output>
				<p>
					{cloud
						? t('Memories plus {years} year(s) of storage', { years: String(years) })
						: t('Memories only, no storage')}
				</p>
				{quote && (
					<>
						<dl>
							<div>
								<dt>{t('Memories, paid once')}</dt>
								<dd>{money(quote.captureCents)}</dd>
							</div>
							<div>
								<dt>{t('Storage, every year added up')}</dt>
								<dd>{money(quote.storageCents)}</dd>
							</div>
						</dl>
						{cloud && (
							<ol className="mm-estimate-years" aria-label={t('Price per year')}>
								{quote.annualPayments.map(({ cents, year }) => (
									<li key={year}>
										<span>
											{t('Year')} {year}
										</span>
										<span
											style={{ width: `${(cents / (quote.annualCents[0] ?? 1)) * 100}%` }}
											className="mm-price-bar"
										/>
										<strong>{money(cents)}</strong>
									</li>
								))}
							</ol>
						)}
					</>
				)}
				<button type="button" className={buttonLime} disabled={!valid} onClick={save}>
					{t('Save this estimate')}
				</button>
				<p role="status" className="mm-fineprint">
					{saved || t('No account, no payment.')}
				</p>
			</div>
			<p className="mm-simulator-note">{t('Prices may change before payments open.')}</p>
		</section>
	)
}
