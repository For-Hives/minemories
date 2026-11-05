// Local tool: shows which mod JARs exist per loader x Minecraft version x loader version,
// builds a missing cell, or prepares the GitHub issue for a combination that is not set up yet.
// Usage: bun mod:matrix [list | open | build <loader> <mc> [loaderVersion] | build --missing | issue <loader> <mc> [loaderVersion] [--create] | ci]
// `ci` prints the cells to build in the quality workflow.
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { isMain, repositoryRoot } from './release-utils.mjs'

const minimumGradleJava = 21
const archiveRoot = ['build', 'mod-matrix']
const archiveNamePattern = /^minemories-(.+)-(forge|fabric|neoforge|quilt)-mc([\d.]+)-(.+)\.jar$/
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

// One flat folder: the file name carries everything needed to tell the builds apart.
export function archiveName(build, loaderVersion, version) {
	return `minemories-${version}-${build.loader}-mc${build.minecraft}-${loaderVersion}.jar`
}

export function parseArchiveName(name) {
	const match = archiveNamePattern.exec(name)
	return match && { version: match[1], loader: match[2], minecraft: match[3], loaderVersion: match[4] }
}

async function scanArchive(base, add) {
	for (const name of await listDir(base)) {
		const parsed = parseArchiveName(name)
		if (parsed) add(parsed.loader, parsed.minecraft, parsed.loaderVersion, parsed.version)
	}
}

export async function scanCells(matrix, root = repositoryRoot) {
	const cells = new Map()
	const add = (loader, minecraft, loaderVersion, version) => {
		const key = cellKey(loader, minecraft, loaderVersion)
		cells.set(key, [...new Set([...(cells.get(key) ?? []), version])].sort())
	}
	await scanBuildOutputs(matrix, root, add)
	await scanArchive(join(root, ...archiveRoot), add)
	return cells
}

export function cellState(versions, current) {
	if (!versions || versions.length === 0) return 'missing'
	return versions.includes(current) ? 'current' : 'stale'
}

const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true })
const ansi = { current: '32', stale: '33', todo: '31', planned: '36', none: '2', head: '1' }
const marks = { current: '✓', stale: '⚠', todo: '✗', planned: '○' }

// One entry per loader version known for a (loader, Minecraft) pair, with its build state:
// current (built for this mod version), stale (only older builds), todo (configured, not built), planned.
export function matrixEntries(matrix, cells, loader, minecraft) {
	const versions = new Set()
	const planned = new Set()
	for (const b of matrix.builds) if (b.loader === loader && b.minecraft === minecraft) versions.add(b.loaderVersion)
	for (const p of matrix.planned ?? [])
		if (p.loader === loader && p.minecraft === minecraft) {
			versions.add(p.loaderVersion)
			planned.add(p.loaderVersion)
		}
	for (const key of cells.keys()) {
		const [l, m, loaderVersion] = key.split('|')
		if (l === loader && m === minecraft) versions.add(loaderVersion)
	}
	return [...versions].sort(byVersion).map(loaderVersion => {
		const built = cells.get(cellKey(loader, minecraft, loaderVersion))
		const configured = matrix.builds.some(
			b => b.loader === loader && b.minecraft === minecraft && b.loaderVersion === loaderVersion
		)
		let state = 'todo'
		if (built?.length) state = cellState(built, matrix.version) === 'current' ? 'current' : 'stale'
		else if (!configured && planned.has(loaderVersion)) state = 'planned'
		return { loaderVersion, state }
	})
}

export function renderMatrix(matrix, cells, { color = false } = {}) {
	const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text)
	const loaders = [...new Set([...matrix.builds, ...(matrix.planned ?? [])].map(b => b.loader))].sort()
	const minecraft = [...matrix.minecraft].sort(byVersion).reverse()
	const rows = minecraft.map(mc => [
		paint(ansi.head, mc),
		...loaders.map(loader => {
			const entries = matrixEntries(matrix, cells, loader, mc)
			if (!entries.length) return paint(ansi.none, '·')
			return entries.map(e => paint(ansi[e.state], `${marks[e.state]} ${e.loaderVersion}`)).join('  ')
		}),
	])
	const header = ['Minecraft', ...loaders.map(l => paint(ansi.head, l))]
	const width = text => stripVTControlCharacters(text).length
	const widths = header.map((_, i) => Math.max(...[header, ...rows].map(row => width(row[i]))))
	const line = row =>
		row
			.map((cell, i) => cell + ' '.repeat(widths[i] - width(cell)))
			.join('   ')
			.trimEnd()
	return [paint(ansi.head, `Mod ${matrix.version}`), '', line(header), ...rows.map(line)].join('\n')
}

/** Java that compiles a Minecraft version: 17 before 1.21, 21 from there on. */
export function javaFor(minecraft) {
	return Number(minecraft.split('.')[1]) >= 21 ? '21' : '17'
}

/** Cells the `mod` job does not already build (it builds the 1.21.1 root): one CI job each. */
export function ciCells(matrix) {
	return matrix.builds
		.filter(build => build.dir !== 'mod/minemories')
		.map(({ loader, minecraft, loaderVersion, dir, project }) => ({
			id: `${loader}-mc${minecraft}`,
			loader,
			minecraft,
			loaderVersion,
			dir,
			project,
			java: javaFor(minecraft),
		}))
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
	const target = join(root, ...archiveRoot)
	const archived = archiveName(build, loaderVersion, matrix.version)
	await mkdir(target, { recursive: true })
	await copyFile(source, join(target, archived))
	console.log(`✓ ${join(...archiveRoot, archived)}`)
}

export function issueFor(matrix, loader, minecraft, loaderVersion) {
	const build = findBuild(matrix, loader, minecraft)
	const plan = (matrix.planned ?? []).find(p => p.loader === loader && p.minecraft === minecraft)
	const version = loaderVersion ?? build?.loaderVersion ?? plan?.loaderVersion ?? '<version du loader>'
	const title = `feat(mod): prendre en charge ${loader} ${version} pour Minecraft ${minecraft}`
	const body = [
		`## Contexte`,
		`Ajouter la cible **${loader} ${version}** pour **Minecraft ${minecraft}** à la grille de versions (\`bun mod:matrix\`).`,
		build
			? `Un build existe déjà pour ${loader} ${minecraft} (loader ${build.loaderVersion}) ; il faut ajouter la version ${version}.`
			: `Aucun projet Gradle ne cible encore ${loader} ${minecraft}.`,
		...(plan ? [`Cible prévue (priorité ${plan.priority}, Java ${plan.java}) : ${plan.note}.`] : []),
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

function openArchive() {
	const folder = join(repositoryRoot, ...archiveRoot)
	mkdirSync(folder, { recursive: true })
	console.log(folder)
	spawnSync('xdg-open', [folder], { stdio: 'ignore' })
}

function listGrids(matrix, cells) {
	const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
	const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text)
	console.log(renderMatrix(matrix, cells, { color }))
	console.log(
		`\n${paint(ansi.current, '✓ à jour')}  ${paint(ansi.stale, '⚠ ancien')}  ${paint(ansi.todo, '✗ à compiler')}  ${paint(ansi.planned, '○ prévu')}  ${paint(ansi.none, '· rien')}`
	)
	console.log(paint(ansi.none, `JAR : bun mod:matrix open  (${join(repositoryRoot, ...archiveRoot)})`))
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

function printCiCells(matrix) {
	const cells = JSON.stringify({ include: ciCells(matrix) })
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `cells=${cells}\n`)
	console.log(cells)
}

export async function main(argv) {
	const matrix = await readMatrix()
	const [command = 'list', ...rest] = argv
	if (command === 'ci') return printCiCells(matrix)
	const flags = rest.filter(a => a.startsWith('--'))
	const [loader, minecraft, requested] = rest.filter(a => !a.startsWith('--'))
	const cells = await scanCells(matrix)
	if (command === 'list') return listGrids(matrix, cells)
	if (command === 'open') return openArchive()
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
