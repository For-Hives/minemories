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
			eyebrow="MINEMORIES / CLOUD"
			title={t('Keep your worlds. Plan for the future.')}
			lead={t(
				'€2 per snapshot. Long-term cloud storage from €6/year, decreasing to €3/year as your memory grows older.'
			)}
		>
			<p className="mm-release-label">{t('Offer in preparation · working calculator · payments not enabled')}</p>
			<div className="mm-plan-grid">
				<section className="mm-plan">
					<span className="mm-kicker">{t('The memory')}</span>
					<h2>Snapshot</h2>
					<p className="mm-big-price">
						2 € <span>{t('/ snapshot')}</span>
					</p>
					<p>{t('A one-time fee at creation, to freeze a moment of your world.')}</p>
					<ul>
						<li>{t('One-time payment per snapshot')}</li>
						<li>{t('Optional cloud, billed separately')}</li>
						<li>{t('Keep a local copy too')}</li>
					</ul>
					<a href="#simulator" className={buttonOutline}>
						{t('Calculate my budget')}
					</a>
				</section>
				<section className="mm-plan mm-plan-featured">
					<span className="mm-kicker">{t('Preservation')}</span>
					<h2>{t('Long-term cloud')}</h2>
					<p className="mm-big-price">
						6 <span>→</span> 3 € <span>{t('/ year')}</span>
					</p>
					<p>{t('Per stored snapshot. The price decreases each year, then stays at €3/year from the fourth year.')}</p>
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
					<a href="#simulator" className={buttonLime}>
						{t('Plan my storage')}
					</a>
				</section>
			</div>
			<PriceSimulator />
			<div className="mm-prose">
				<h2>{t('What you can do today')}</h2>
				<p>
					{t(
						'Install the mod, export a 3D memory as a GLB, find it in your private gallery after pairing. Commercial snapshots and long-term storage are in preparation. A 3D capture does not replace a playable world backup; full-save archiving still needs development.'
					)}
				</p>
				<h2>{t('How does the decreasing price work?')}</h2>
				<p>
					{t(
						'The calculator counts €6 for the first year of each snapshot, €5 for the second, €4 for the third, then €3/year. Renewals are annual; the multi-year total is a projection, not an amount charged today.'
					)}
				</p>
			</div>
			<div className="mm-actions">
				<Link to="/installation" className={buttonLime}>
					{t('Create my first memory')}
				</Link>
				<Link to="/terms" className={buttonOutline}>
					{t('Project terms')}
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
			setSaved(t('Estimate saved on this device. No purchase made.'))
		} catch {
			setSaved(t('Your browser cannot save it. The estimate remains visible.'))
		}
	}
	return (
		<section id="simulator" className="mm-price-simulator" aria-labelledby="simulator-title">
			<div>
				<span className="mm-kicker">{t('At your pace')}</span>
				<h2 id="simulator-title">{t('Imagine your collection.')}</h2>
				<p>{t('Adjust its size and duration. The amounts update immediately.')}</p>
				<div className="mm-simulator-fields">
					<label htmlFor="snapshot-count">{t('Number of snapshots')}</label>
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
						{t('Add long-term cloud')}
					</label>
					<label htmlFor="storage-years">
						{t('Projection length')} : {years} {t('year(s)')}
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
				<span className="mm-kicker">{t('Your estimate')}</span>
				<output className="mm-estimate-total" aria-live="polite" aria-label={t('Estimated total')}>
					{quote ? money(quote.totalCents) : '—'}
				</output>
				<p>
					{cloud
						? t('{years}-year projection, including creation').replace('{years}', String(years))
						: t('Creation only, without cloud')}
				</p>
				{quote && (
					<>
						<dl>
							<div>
								<dt>{t('Snapshots · once')}</dt>
								<dd>{money(quote.captureCents)}</dd>
							</div>
							<div>
								<dt>{t('Cloud · projected total')}</dt>
								<dd>{money(quote.storageCents)}</dd>
							</div>
						</dl>
						{cloud && (
							<ol className="mm-estimate-years" aria-label={t('Annual schedule')}>
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
					{saved || t('No account needed. No payment.')}
				</p>
			</div>
			<p className="mm-simulator-note">
				{t(
					'This projection assumes snapshots created together and continuous storage. Billing rules, taxes and storage terms will be finalized before payments open.'
				)}
			</p>
		</section>
	)
}
