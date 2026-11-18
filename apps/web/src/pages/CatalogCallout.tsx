import { buttonLime } from '../components/ui'
import { T } from '../i18n/I18n'
import { catalogLinks } from './installation-loaders'
import './catalog-callout.css'

/**
 * The mod's catalog pages (CurseForge while Modrinth is not public), offered next to the manual download: the app
 * installs Minemories and, on Fabric, Fabric API. Nothing is drawn when no catalog has a public URL.
 */
export function CatalogCallout() {
	const links = catalogLinks()
	if (links.length === 0) return null
	return (
		<aside className="mm-catalog-callout">
			{links.map(catalog => (
				<div key={catalog.name} className="mm-catalog-callout__row">
					<div>
						<strong>
							<T message={'With the {app} app'} params={{ app: catalog.name }} />
						</strong>
						<span>
							<T message={'The app installs Minemories and what it needs.'} />
						</span>
					</div>
					<a className={buttonLime} href={catalog.url} rel="noopener">
						<T message={'Minemories on {app}'} params={{ app: catalog.name }} />
					</a>
				</div>
			))}
		</aside>
	)
}
