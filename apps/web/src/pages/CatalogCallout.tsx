import { T } from '../i18n/I18n'
import { catalogLinks } from './installation-loaders'

/**
 * The mod's catalog pages (CurseForge while Modrinth is not public), offered next to the manual download as one line
 * (the app installs Minemories and, on Fabric, Fabric API). Nothing is drawn when no catalog has a public URL.
 */
export function CatalogCallout() {
	return catalogLinks().map(catalog => (
		<p key={catalog.name} className="mm-dl-catalog">
			<a href={catalog.url} rel="noopener">
				<T message={'Or install it with the {app} app'} params={{ app: catalog.name }} />
				&nbsp;→
			</a>
		</p>
	))
}
