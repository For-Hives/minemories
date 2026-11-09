import { Link } from 'react-router'
import { buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { downloadGrid, type GridCell } from './downloads-grid'
import { guideLink, validatedMinecraft } from './installation-state'
import { indexUrl, isExperimentalMinecraft, latestDownloadUrl, loaderTargets, quiltTestedVersion } from './mod-releases'
import { useModReleases } from './useModReleases'
import './downloads.css'

function rowBadge(minecraft: string): string | null {
	if (isExperimentalMinecraft(minecraft)) return 'Experimental · not validated in game yet'
	return minecraft === validatedMinecraft ? 'Validated in game' : null
}

function Cell({ cell, status, name }: { cell: GridCell; status: 'loading' | 'ready' | 'error'; name: string }) {
	const { t, locale } = useI18n()
	const { download, release, target } = cell
	if (release && download && target)
		return (
			<td className="mm-dl-cell">
				<a
					className={`${buttonOutline} mm-dl-button`}
					href={download.url}
					aria-label={t('Download Minemories {version} for Minecraft {minecraft} with {loader}', {
						version: release.version,
						minecraft: target.minecraft,
						loader: name,
					})}
				>
					<T message={'Download'} />
				</a>
				<span className="mm-dl-meta">
					{release.version} · {(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })} MiB
				</span>
				<details>
					<summary>SHA-256</summary>
					<code>{download.sha256}</code>
				</details>
				<Link className="mm-dl-guide" to={guideLink(target)}>
					<T message={'Guided installation'} />
				</Link>
			</td>
		)
	let message = 'Not published yet'
	if (!target) message = 'Not available for this version'
	else if (status === 'loading') message = 'Checking…'
	else if (status === 'error') message = 'Unavailable right now'
	return (
		<td className="mm-dl-cell mm-dl-empty">
			<span>{t(message)}</span>
		</td>
	)
}

/** Every Minecraft version x loader with its newest JAR: the grid of the terminal's `bun mod status`, for the web. */
export function DownloadsPage() {
	const { t } = useI18n()
	const { releases, status, retry } = useModReleases()
	const grid = downloadGrid(releases)
	return (
		<ContentLayout
			eyebrow={t('MINEMORIES · DOWNLOADS')}
			title={t('All downloads')}
			lead={t(
				'Pick your Minecraft version and your loader, then download the matching file. A grayed cell has no file yet.'
			)}
		>
			<div className="mm-dl-scroll" aria-busy={status === 'loading'}>
				<table className="mm-dl-table">
					<caption className="mm-dl-sr-only">{t('Minemories downloads by Minecraft version and mod loader')}</caption>
					<thead>
						<tr>
							<th scope="col">Minecraft</th>
							{grid.loaders.map(item => (
								<th key={item.loader} scope="col">
									{item.name}
									{item.loader === 'fabric' && <small>+ Fabric API</small>}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{grid.rows.map(row => {
							const badge = rowBadge(row.minecraft)
							return (
								<tr key={row.minecraft}>
									<th scope="row">
										<span>{row.minecraft}</span>
										{badge && <em>{t(badge)}</em>}
									</th>
									{row.cells.map(cell => (
										<Cell
											key={cell.loader}
											cell={cell}
											status={status}
											name={grid.loaders.find(item => item.loader === cell.loader)?.name ?? cell.loader}
										/>
									))}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			{status === 'error' && (
				<div className="mm-dl-feedback" role="alert">
					<p>{t('The list of versions could not be loaded. Try again in a moment.')}</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{t('Retry download')}
					</button>
				</div>
			)}
			<noscript>
				<p className="mm-dl-note">
					{t('Enable JavaScript to see the available versions here.')} <a href={indexUrl}>index.json</a>
				</p>
				<ul className="mm-dl-note">
					{loaderTargets.map(item => (
						<li key={item.id}>
							<a href={latestDownloadUrl(item.minecraft, item.loader)}>
								{item.name} · Minecraft {item.minecraft}
							</a>
						</li>
					))}
				</ul>
			</noscript>
			<p className="mm-dl-note">
				{t('Install Fabric API separately. This same JAR is also tested under Quilt {version}.', {
					version: quiltTestedVersion,
				})}
			</p>
			<p className="mm-dl-links">
				<Link to="/installation">
					<T message={'Not sure? Follow the guided installation'} />
				</Link>
				<Link to="/versions">
					<T message={"Previous versions and what's new"} />
				</Link>
			</p>
		</ContentLayout>
	)
}
