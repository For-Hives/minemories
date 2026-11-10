import { Link } from 'react-router'
import { buttonOutline } from '../components/ui'
import { pageQuestions } from '../content/faq'
import { T, useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { downloadGrid, type GridCell } from './downloads-grid'
import { Questions } from './InfoPages'
import { guideLink, versionBadge } from './installation-state'
import { latestDownloadUrl, quiltTestedVersion } from './mod-releases'
import { useModReleases } from './useModReleases'
import './downloads.css'

type Status = 'loading' | 'ready' | 'error'

/**
 * A published pair is a download link from the first paint: the prerendered page and a slow or failed index link the
 * API's newest JAR. Once the index is read, the cell names the exact version, its size and its SHA-256.
 */
function Cell({ cell, status, name }: { cell: GridCell; status: Status; name: string }) {
	const { t, locale } = useI18n()
	const { download, release, target } = cell
	if (!target)
		return (
			<td className="mm-dl-cell mm-dl-empty">
				<span>{t('Not available for this version')}</span>
			</td>
		)
	if (status === 'ready' && !(release && download))
		return (
			<td className="mm-dl-cell mm-dl-empty">
				<span>{t('Not published yet')}</span>
			</td>
		)
	const label = t('Download Minemories for Minecraft {minecraft} with {loader}', {
		minecraft: target.minecraft,
		loader: name,
	})
	return (
		<td className="mm-dl-cell">
			<a
				className={`${buttonOutline} mm-dl-button`}
				href={download?.url ?? latestDownloadUrl(target.minecraft, target.loader)}
				aria-label={release ? `${label} (${release.version})` : label}
			>
				<T message={'Download'} />
			</a>
			{release && download ? (
				<>
					<span className="mm-dl-meta">
						{release.version} · {(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })} MiB
					</span>
					<details>
						<summary>SHA-256</summary>
						<code>{download.sha256}</code>
					</details>
				</>
			) : (
				<span className="mm-dl-meta">
					{name} {target.loaderVersion}
				</span>
			)}
			<Link className="mm-dl-guide" to={guideLink(target)}>
				<T message={'Guided installation'} />
			</Link>
		</td>
	)
}

/** Every Minecraft version x loader with its Java version and newest JAR, readable in the prerendered HTML. */
export function DownloadsPage() {
	const { t } = useI18n()
	const { releases, status, retry } = useModReleases()
	const grid = downloadGrid(releases)
	return (
		<ContentLayout
			eyebrow={t('MINEMORIES · DOWNLOADS')}
			title={t('Download Minemories')}
			lead={t('One JAR per Minecraft version and loader.')}
		>
			<div className="mm-dl-scroll" aria-busy={status === 'loading'}>
				<table className="mm-dl-table">
					<caption className="mm-dl-sr-only">{t('Minemories downloads by Minecraft version and mod loader')}</caption>
					<thead>
						<tr>
							<th scope="col">Minecraft</th>
							<th scope="col">Java</th>
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
							const badge = versionBadge(row.minecraft)
							return (
								<tr key={row.minecraft}>
									<th scope="row">
										<span>{row.minecraft}</span>
										{badge && <em>{t(badge)}</em>}
									</th>
									<td className="mm-dl-java">{row.java}</td>
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
			<p className="mm-dl-note">
				{t('Install Fabric API separately. This same JAR is also tested under Quilt {version}.', {
					version: quiltTestedVersion,
				})}{' '}
				{t('Check your file: its SHA-256 checksum must match the one shown here.')}
			</p>
			<p className="mm-dl-links">
				<Link to="/installation">
					<T message={'Not sure? The guide asks you two questions.'} />
				</Link>
				<Link to="/versions">
					<T message={'What changes in Minemories'} />
				</Link>
			</p>
			<Questions ids={pageQuestions.downloads} />
		</ContentLayout>
	)
}
