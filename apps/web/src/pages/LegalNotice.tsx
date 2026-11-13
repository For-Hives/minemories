import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Rich, useI18n } from '../i18n/I18n'
import './legal.css'

/** One fact of a legal card: a translated label and a value kept as registered (names, numbers, addresses). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<dt>{label}</dt>
			<dd>{children}</dd>
		</div>
	)
}

/**
 * The French legal notice ("mentions légales"): who publishes Minemories, who hosts it and how to reach them. Names,
 * registration numbers and addresses are not translated; only their labels are.
 */
export function LegalNotice() {
	const { t } = useI18n()
	return (
		<div className="mm-prose mm-legal">
			<section aria-labelledby="legal-publisher">
				<h2 id="legal-publisher">{t('Publisher')}</h2>
				<p>{t('Minemories is published by Andy Cinquin, who is also its publication director.')}</p>
				<dl className="mm-legal-card">
					<Fact label={t('Name')}>Andy Cinquin</Fact>
					<Fact label="SIRET">880 505 276 00035</Fact>
					<Fact label={t('Address')}>
						1250 chemin de la Renouillère
						<br />
						74140 Sciez, {t('France')}
					</Fact>
					<Fact label={t('Phone')}>
						<a className="mc-link" href="tel:+33621582684">
							+33 6 21 58 26 84
						</a>
					</Fact>
					<Fact label={t('Website')}>
						<a className="mc-link" href="https://andy-cinquin.com">
							andy-cinquin.com
						</a>
					</Fact>
				</dl>
			</section>
			<section aria-labelledby="legal-host">
				<h2 id="legal-host">{t('Hosting')}</h2>
				<p>
					{t('The site, the API, the database, the captures and the mod files are hosted on a server rented from:')}
				</p>
				<dl className="mm-legal-card">
					<Fact label={t('Name')}>Contabo GmbH</Fact>
					<Fact label={t('Address')}>
						Welfenstrasse 22
						<br />
						81541 München, {t('Germany')}
					</Fact>
					<Fact label={t('Register court')}>AG München</Fact>
					<Fact label={t('Register number')}>HRB 180722</Fact>
					<Fact label={t('VAT ID')}>DE267602842</Fact>
					<Fact label={t('Website')}>
						<a className="mc-link" href="https://contabo.com">
							contabo.com
						</a>
					</Fact>
				</dl>
			</section>
			<section aria-labelledby="legal-contact">
				<h2 id="legal-contact">{t('Contact')}</h2>
				<p>
					<Rich
						message={
							'For a question, a request about your personal data, or to report a capture or a shared link, contact the publisher by phone, by post or through {site}.'
						}
						slots={{
							site: (
								<a className="mc-link mm-nowrap" href="https://andy-cinquin.com">
									andy-cinquin.com
								</a>
							),
						}}
					/>
				</p>
				<p>
					{t('How Minemories handles your data is explained on the privacy page.')}{' '}
					<Link className="mc-link" to="/privacy">
						{t('Read the privacy policy')}
					</Link>
				</p>
			</section>
		</div>
	)
}
