import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { cloudScheduleCents, defaultQuote, parseSavedQuote, quotePrice, quoteStorageKey } from '../content/pricing'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { ContentLayout } from './ContentPages'
export function PricingPage() {
	const { copy } = useLocalizedCopy()
	return (
		<ContentLayout
			eyebrow="MINEMORIES / CLOUD"
			title={copy('Garde tes mondes. Pense à la suite.', 'Keep your worlds. Plan for the future.')}
			lead={copy(
				'2 € par snapshot. Un cloud longue durée dès 6 €/an, qui descend jusqu’à 3 €/an à mesure que ton souvenir prend de l’âge.',
				'€2 per snapshot. Long-term cloud storage from €6/year, decreasing to €3/year as your memory grows older.'
			)}
		>
			<p className="mm-release-label">
				{copy(
					'Offre en préparation · simulateur utilisable · aucun paiement activé',
					'Offer in preparation · working calculator · payments not enabled'
				)}
			</p>
			<div className="mm-plan-grid">
				<section className="mm-plan">
					<span className="mm-kicker">{copy('Le souvenir', 'The memory')}</span>
					<h2>Snapshot</h2>
					<p className="mm-big-price">
						2 € <span>{copy('/ snapshot', '/ snapshot')}</span>
					</p>
					<p>
						{copy(
							'Une prise en charge à la création, pour figer un moment de ton monde.',
							'A one-time fee at creation, to freeze a moment of your world.'
						)}
					</p>
					<ul>
						<li>{copy('Paiement unique par snapshot', 'One-time payment per snapshot')}</li>
						<li>{copy('Cloud optionnel, facturé séparément', 'Optional cloud, billed separately')}</li>
						<li>{copy('Garde aussi une copie locale', 'Keep a local copy too')}</li>
					</ul>
					<a href="#simulator" className={buttonOutline}>
						{copy('Calculer mon budget', 'Calculate my budget')}
					</a>
				</section>
				<section className="mm-plan mm-plan-featured">
					<span className="mm-kicker">{copy('La conservation', 'Preservation')}</span>
					<h2>{copy('Cloud longue durée', 'Long-term cloud')}</h2>
					<p className="mm-big-price">
						6 <span>→</span> 3 € <span>{copy('/ an', '/ year')}</span>
					</p>
					<p>
						{copy(
							'Par snapshot conservée. Le tarif baisse chaque année, puis reste à 3 €/an dès la quatrième.',
							'Per stored snapshot. The price decreases each year, then stays at €3/year from the fourth year.'
						)}
					</p>
					<ol className="mm-price-steps">
						{cloudScheduleCents.map((cents, index) => (
							<li key={cents}>
								<span>
									{copy('Année', 'Year')} {index + 1}
									{index === 3 ? '+' : ''}
								</span>
								<strong>{cents / 100} €</strong>
							</li>
						))}
					</ol>
					<a href="#simulator" className={buttonLime}>
						{copy('Préparer ma conservation', 'Plan my storage')}
					</a>
				</section>
			</div>
			<PriceSimulator />
			<div className="mm-prose">
				<h2>{copy('Ce que tu peux faire aujourd’hui', 'What you can do today')}</h2>
				<p>
					{copy(
						'Installer le mod, exporter un souvenir 3D en GLB, l’ouvrir localement et utiliser la galerie privée après appairage. Le service commercial de snapshot et sa conservation longue durée sont en préparation. Une capture 3D ne remplace pas une sauvegarde jouable du monde ; l’archivage des sauvegardes complètes reste à développer.',
						'Install the mod, export a 3D memory as a GLB, open it locally and use the private gallery after pairing. Commercial snapshots and long-term storage are in preparation. A 3D capture does not replace a playable world backup; full-save archiving still needs development.'
					)}
				</p>
				<h2>{copy('Comment fonctionne la dégressivité ?', 'How does the decreasing price work?')}</h2>
				<p>
					{copy(
						'Le simulateur compte 6 € pour la première année de chaque snapshot, 5 € pour la deuxième, 4 € pour la troisième, puis 3 € par an. Les renouvellements se font chaque année ; le total sur plusieurs années est une projection, pas une somme débitée aujourd’hui.',
						'The calculator counts €6 for the first year of each snapshot, €5 for the second, €4 for the third, then €3/year. Renewals are annual; the multi-year total is a projection, not an amount charged today.'
					)}
				</p>
			</div>
			<div className="mm-actions">
				<Link to="/installation" className={buttonLime}>
					{copy('Créer mon premier souvenir', 'Create my first memory')}
				</Link>
				<Link to="/terms" className={buttonOutline}>
					{copy('Conditions du projet', 'Project terms')}
				</Link>
			</div>
		</ContentLayout>
	)
}
export function PriceSimulator() {
	const { locale, copy } = useLocalizedCopy()
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
			setSaved(
				copy(
					'Estimation gardée sur cet appareil. Aucun achat effectué.',
					'Estimate saved on this device. No purchase made.'
				)
			)
		} catch {
			setSaved(
				copy(
					'Le navigateur ne permet pas l’enregistrement. L’estimation reste affichée.',
					'Your browser cannot save it. The estimate remains visible.'
				)
			)
		}
	}
	return (
		<section id="simulator" className="mm-price-simulator" aria-labelledby="simulator-title">
			<div>
				<span className="mm-kicker">{copy('À ton rythme', 'At your pace')}</span>
				<h2 id="simulator-title">{copy('Imagine ta collection.', 'Imagine your collection.')}</h2>
				<p>
					{copy(
						'Ajuste la taille et la durée. Les montants évoluent tout de suite.',
						'Adjust its size and duration. The amounts update immediately.'
					)}
				</p>
				<div className="mm-simulator-fields">
					<label htmlFor="snapshot-count">{copy('Nombre de snapshots', 'Number of snapshots')}</label>
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
							{copy('Choisis un nombre entier entre 1 et 100.', 'Choose a whole number between 1 and 100.')}
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
						{copy('Ajouter le cloud longue durée', 'Add long-term cloud')}
					</label>
					<label htmlFor="storage-years">
						{copy('Durée de projection', 'Projection length')} : {years} {copy('an(s)', 'year(s)')}
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
				<span className="mm-kicker">{copy('Ton estimation', 'Your estimate')}</span>
				<output className="mm-estimate-total" aria-live="polite" aria-label={copy('Total estimé', 'Estimated total')}>
					{quote ? money(quote.totalCents) : '—'}
				</output>
				<p>
					{cloud
						? copy(`Projection sur ${years} an(s), création incluse`, `${years}-year projection, including creation`)
						: copy('Création seule, sans cloud', 'Creation only, without cloud')}
				</p>
				{quote && (
					<>
						<dl>
							<div>
								<dt>{copy('Snapshots · une seule fois', 'Snapshots · once')}</dt>
								<dd>{money(quote.captureCents)}</dd>
							</div>
							<div>
								<dt>{copy('Cloud · total projeté', 'Cloud · projected total')}</dt>
								<dd>{money(quote.storageCents)}</dd>
							</div>
						</dl>
						{cloud && (
							<ol className="mm-estimate-years" aria-label={copy('Échéancier annuel', 'Annual schedule')}>
								{quote.annualPayments.map(({ cents, year }) => (
									<li key={year}>
										<span>
											{copy('Année', 'Year')} {year}
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
					{copy('Garder cette estimation', 'Save this estimate')}
				</button>
				<p role="status" className="mm-fineprint">
					{saved || copy('Aucun compte nécessaire. Aucun paiement.', 'No account needed. No payment.')}
				</p>
			</div>
			<p className="mm-simulator-note">
				{copy(
					'Cette projection suppose des snapshots créées ensemble et une conservation continue. Les règles de facturation, les taxes et les conditions de stockage seront finalisées avant l’ouverture des paiements.',
					'This projection assumes snapshots created together and continuous storage. Billing rules, taxes and storage terms will be finalized before payments open.'
				)}
			</p>
		</section>
	)
}
