// Local tool: shows which mod JARs exist per loader x Minecraft version x loader version,
// builds a missing cell, or prepares the GitHub issue for a combination that is not set up yet.
// Usage: bun mod:matrix [list | build <loader> <mc> [loaderVersion] | build --missing | issue <loader> <mc> [loaderVersion] [--create]]
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isMain, repositoryRoot } from './release-utils.mjs'

const minimumGradleJava = 21
const archiveRoot = ['build', 'mod-matrix']
const modVersionLine = /^mod_version=(.+)$/m
const releaseVersion = /^\d+\.\d+\.\d+(-[\w.]+)?$/
const jdkRelease = /JAVA_VERSION="(\d+)/

export async function readMatrix(root = repositoryRoot) {
	const matrix = JSON.parse(await readFile(resolve(root, 'config/mod-matrix.json'), 'utf8'))
	const properties = await readFile(resolve(root, 'mod/minemories/gradle.properties'), 'utf8')
	const version = modVersionLine.exec(properties)?.[1]?.trim()
	if (!version) throw new Error('mod_version not found in mod/minemories/gradle.properties.')
	return { ...matrix, version }
}

async function listDir(path) {
	try {
		return await readdir(path)
	} catch {
		return []
	}
}

export function jarVersion(name, template) {
	const [prefix, suffix] = template.split('{version}')
	if (!(name.startsWith(prefix) && name.endsWith(suffix))) return null
	const version = name.slice(prefix.length, name.length - suffix.length)
	return releaseVersion.test(version) ? version : null
}

// Cells are keyed `loader|minecraft|loaderVersion`; each holds the sorted mod versions that exist.
function cellKey(loader, minecraft, loaderVersion) {
	return [loader, minecraft, loaderVersion].join('|')
}

async function scanBuildOutputs(matrix, root, add) {
	for (const build of matrix.builds)
		for (const name of await listDir(join(root, build.dir, build.project, 'build', 'libs'))) {
			const version = jarVersion(name, build.jar)
			// A plain Gradle build only ever targets the pinned loader version.
			if (version) add(build.loader, build.minecraft, build.loaderVersion, version)
		}
}

async function scanArchiveCell(build, dir, loaderVersion, add) {
	for (const name of await listDir(dir)) {
		const version = jarVersion(name, build.jar)
		if (version) add(build.loader, build.minecraft, loaderVersion, version)
	}
}

async function scanArchive(matrix, base, add) {
	for (const loader of await listDir(base))
		for (const minecraft of await listDir(join(base, loader))) {
			const build = findBuild(matrix, loader, minecraft)
			if (!build) continue
			for (const loaderVersion of await listDir(join(base, loader, minecraft)))
				await scanArchiveCell(build, join(base, loader, minecraft, loaderVersion), loaderVersion, add)
		}
}

export async function scanCells(matrix, root = repositoryRoot) {
	const cells = new Map()
	const add = (loader, minecraft, loaderVersion, version) => {
		const key = cellKey(loader, minecraft, loaderVersion)
		cells.set(key, [...new Set([...(cells.get(key) ?? []), version])].sort())
	}
	await scanBuildOutputs(matrix, root, add)
	await scanArchive(matrix, join(root, ...archiveRoot), add)
	return cells
}

export function cellState(versions, current) {
	if (!versions || versions.length === 0) return 'missing'
	return versions.includes(current) ? 'current' : 'stale'
}

export function loaderGrid(matrix, cells, loader) {
	const loaderVersions = new Set(matrix.builds.filter(b => b.loader === loader).map(b => b.loaderVersion))
	for (const key of cells.keys()) {
		const [l, , loaderVersion] = key.split('|')
		if (l === loader) loaderVersions.add(loaderVersion)
	}
	const columns = [...loaderVersions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	const rows = matrix.minecraft.map(minecraft => ({
		minecraft,
		configured: matrix.builds.some(b => b.loader === loader && b.minecraft === minecraft),
		cells: columns.map(loaderVersion => {
			const versions = cells.get(cellKey(loader, minecraft, loaderVersion)) ?? []
			const pinned = matrix.builds.some(
				b => b.loader === loader && b.minecraft === minecraft && b.loaderVersion === loaderVersion
			)
			return { loaderVersion, versions, pinned, state: cellState(versions, matrix.version) }
		}),
	}))
	return { loader, columns, rows }
}

const symbols = { current: '✓', stale: '⚠', missing: '·' }

function cellLabel(cell, configured) {
	if (cell.versions.length) return `${symbols[cell.state]} ${cell.versions.join(', ')}`
	if (cell.pinned) return `${symbols.missing} à compiler`
	return `${symbols.missing} ${configured ? '—' : 'non configuré'}`
}

export function renderGrid(grid, current) {
	const header = ['Minecraft \\ loader', ...grid.columns]
	const body = grid.rows.map(row => [row.minecraft, ...row.cells.map(cell => cellLabel(cell, row.configured))])
	const widths = header.map((_, i) => Math.max(...[header, ...body].map(line => line[i].length)))
	const line = cells => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`
	const rule = `|${widths.map(w => '-'.repeat(w + 2)).join('|')}|`
	return [
		`${grid.loader.toUpperCase()} (version courante du mod : ${current})`,
		line(header),
		rule,
		...body.map(line),
	].join('\n')
}

export function findBuild(matrix, loader, minecraft) {
	return matrix.builds.find(b => b.loader === loader && b.minecraft === minecraft)
}

export function missingTargets(matrix, cells) {
	return matrix.builds.filter(
		b => cellState(cells.get(cellKey(b.loader, b.minecraft, b.loaderVersion)), matrix.version) !== 'current'
	)
}

export function pickJdk(candidates) {
	const usable = candidates.filter(c => c.major >= minimumGradleJava).sort((a, b) => a.major - b.major)
	return usable[0]?.home ?? null
}

async function javaMajor(home) {
	try {
		const release = await readFile(join(home, 'release'), 'utf8')
		return Number(jdkRelease.exec(release)?.[1])
	} catch {
		return 0
	}
}

export async function findJdk(env = process.env, toolsDir = join(homedir(), '.local', 'tools')) {
	const homes = [
		env.JAVA_HOME,
		...(await listDir(toolsDir)).filter(n => n.startsWith('jdk-')).map(n => join(toolsDir, n)),
	]
	const candidates = []
	for (const home of homes.filter(Boolean)) candidates.push({ home, major: await javaMajor(home) })
	return pickJdk(candidates)
}

export function gradleArgs(build, loaderVersion) {
	const args = [`:${build.project}:build`]
	if (loaderVersion !== build.loaderVersion) args.push(`-P${build.loaderProperty}=${loaderVersion}`)
	return args
}

export function requireBuildable(build, loaderVersion, loader, minecraft) {
	if (!build)
		throw new Error(
			`${loader} ${minecraft} n'est pas configuré. Prépare l'issue : bun mod:matrix issue ${loader} ${minecraft}`
		)
	if (loaderVersion !== build.loaderVersion && !build.loaderProperty)
		throw new Error(
			`Ce build ne sait compiler que ${loader} ${build.loaderVersion} pour ${minecraft} (pas de propriété de version). ` +
				`Prépare l'issue : bun mod:matrix issue ${loader} ${minecraft} ${loaderVersion}`
		)
}

async function buildOne(matrix, build, loaderVersion, root = repositoryRoot) {
	const jdk = await findJdk()
	if (!jdk) throw new Error(`Aucun JDK ${minimumGradleJava}+ trouvé (JAVA_HOME ou ~/.local/tools/jdk-*).`)
	console.log(`\n▶ ${build.loader} ${build.minecraft} (loader ${loaderVersion}) avec ${jdk}`)
	const result = spawnSync('./gradlew', ['--console=plain', ...gradleArgs(build, loaderVersion)], {
		cwd: join(root, build.dir),
		stdio: 'inherit',
		env: { ...process.env, JAVA_HOME: jdk, PATH: `${join(jdk, 'bin')}:${process.env.PATH}` },
	})
	if (result.status !== 0) throw new Error(`Gradle a échoué pour ${build.loader} ${build.minecraft} ${loaderVersion}.`)
	const name = build.jar.replace('{version}', matrix.version)
	const source = join(root, build.dir, build.project, 'build', 'libs', name)
	await stat(source)
	const target = join(root, ...archiveRoot, build.loader, build.minecraft, loaderVersion)
	await mkdir(target, { recursive: true })
	await copyFile(source, join(target, name))
	console.log(`✓ ${join(...archiveRoot, build.loader, build.minecraft, loaderVersion, name)}`)
}

export function issueFor(matrix, loader, minecraft, loaderVersion) {
	const build = findBuild(matrix, loader, minecraft)
	const version = loaderVersion ?? build?.loaderVersion ?? '<version du loader>'
	const title = `feat(mod): prendre en charge ${loader} ${version} pour Minecraft ${minecraft}`
	const body = [
		`## Contexte`,
		`Ajouter la cible **${loader} ${version}** pour **Minecraft ${minecraft}** à la grille de versions (\`bun mod:matrix\`).`,
		build
			? `Un build existe déjà pour ${loader} ${minecraft} (loader ${build.loaderVersion}) ; il faut ajouter la version ${version}.`
			: `Aucun projet Gradle ne cible encore ${loader} ${minecraft}.`,
		'',
		`## À faire`,
		`- [ ] Projet / propriété de version Gradle (Java adapté à Minecraft ${minecraft}), entrée dans \`config/mod-matrix.json\``,
		`- [ ] \`bun mod:matrix build ${loader} ${minecraft} ${version}\` produit le JAR pour la version courante (${matrix.version})`,
		`- [ ] Test en jeu : blocs standards, textures alpha/teintées, contenu moddé, capture GLB puis ouverture dans le viewer`,
		`- [ ] Documenter dans \`docs/features/loader-support.md\` (scénarios et limites)`,
		`- [ ] Activer la cible dans \`config/mod-targets.json\` seulement après validation en jeu`,
		'',
		`Ne jamais annoncer le loader comme pris en charge avant build et test en jeu.`,
	].join('\n')
	return { title, body }
}

function createIssue({ title, body }) {
	const search = spawnSync('gh', ['issue', 'list', '--state', 'open', '--search', title, '--json', 'number,title'], {
		encoding: 'utf8',
	})
	const similar = search.status === 0 ? JSON.parse(search.stdout || '[]') : []
	if (similar.length) {
		console.log('Issues ouvertes proches, rien créé :')
		for (const issue of similar) console.log(`  #${issue.number} ${issue.title}`)
		return
	}
	const args = ['issue', 'create', '--title', title, '--body', body, '--label', 'mod', '--label', 'enhancement']
	spawnSync('gh', args, { stdio: 'inherit' })
}

function listGrids(matrix, cells) {
	const loaders = [...new Set(matrix.builds.map(b => b.loader))]
	console.log(loaders.map(l => renderGrid(loaderGrid(matrix, cells, l), matrix.version)).join('\n\n'))
	console.log('\n✓ version courante compilée   ⚠ seulement d’anciennes versions   · rien de compilé')
}

async function buildMissing(matrix, cells) {
	const todo = missingTargets(matrix, cells)
	if (!todo.length) console.log('Tout est déjà compilé pour la version courante.')
	for (const build of todo) await buildOne(matrix, build, build.loaderVersion)
}

function prepareIssue(matrix, [loader, minecraft, requested], create) {
	const issue = issueFor(matrix, loader, minecraft, requested)
	console.log(`${issue.title}\n\n${issue.body}`)
	if (create) createIssue(issue)
	else console.log('\n(Ajoute --create pour l’ouvrir sur GitHub.)')
}

export async function main(argv) {
	const matrix = await readMatrix()
	const [command = 'list', ...rest] = argv
	const flags = rest.filter(a => a.startsWith('--'))
	const [loader, minecraft, requested] = rest.filter(a => !a.startsWith('--'))
	const cells = await scanCells(matrix)
	if (command === 'list') return listGrids(matrix, cells)
	if (command === 'build' && flags.includes('--missing')) return buildMissing(matrix, cells)
	if (command !== 'build' && command !== 'issue') throw new Error(`Commande inconnue : ${command}`)
	if (!(loader && minecraft)) throw new Error(`Usage : bun mod:matrix ${command} <loader> <minecraft> [loaderVersion]`)
	if (command === 'issue') return prepareIssue(matrix, [loader, minecraft, requested], flags.includes('--create'))
	const build = findBuild(matrix, loader, minecraft)
	const loaderVersion = requested ?? build?.loaderVersion
	requireBuildable(build, loaderVersion, loader, minecraft)
	return buildOne(matrix, build, loaderVersion)
}

if (isMain(import.meta.url)) {
	main(process.argv.slice(2)).catch(error => {
		console.error(error.message)
		process.exit(1)
	})
}
