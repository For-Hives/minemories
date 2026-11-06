import { parseArgs } from '../args.mjs'
import { resolveRemote, summarizeUpload, uploadRelease } from '../remote/index.mjs'
import { readModVersion } from '../version.mjs'
import { collectArtifacts } from './publish.mjs'

export const name = 'push'
export const summary = "Envoie à l'API les JAR déjà construits (build/mod-dist/<version>/), sans recompiler"
export const usage =
	'bun mod push [<version>] [--api-url <url>] [--replace] [--dry-run]\n' +
	'  <version>   défaut : la version courante du mod ; envoie build/mod-dist/<version>/<id>/*.jar\n' +
	"  --api-url   URL de l'API (défaut MOD_API_URL, puis https://api.minemories.net)\n" +
	'  --replace   remplace une version déjà publiée avec un autre contenu (sinon refusée)\n' +
	'  --dry-run   liste ce qui serait envoyé, sans réseau\n' +
	'Jeton : MOD_UPLOAD_TOKEN (environnement ou .env, jamais en argument).'

export async function run(args, { env, log, root, fetchImpl, sleep }) {
	const { positionals, flags } = parseArgs(args, ['api-url'])
	const version = positionals[0] ?? (await readModVersion(root))
	const artifacts = await collectArtifacts(root, version)
	if (artifacts.length === 0) {
		log.error(`Aucun JAR dans build/mod-dist/${version}/<id>/ : lancer « bun mod build » d'abord.`)
		return 1
	}
	const apiUrl = flags['api-url']
	if (flags['dry-run']) {
		const remote = resolveRemote({ apiUrl, env })
		log.info(`[dry-run] ${artifacts.length} artefact(s) ${version} vers ${remote.apiUrl} :`)
		for (const artifact of artifacts) log.info(`  ${artifact.targetId}  ${artifact.bytes} octets`)
		return 0
	}
	const result = await uploadRelease({
		version,
		artifacts,
		env,
		apiUrl,
		replace: Boolean(flags.replace),
		log,
		...(fetchImpl ? { fetchImpl } : {}),
		...(sleep ? { sleep } : {}),
	})
	log.info(`\n${summarizeUpload(result)}`)
	return result.ok ? 0 : 1
}
