import { detectJdks, installJdk, minimumGradleJava, pickGradleJdk, supportedMajors } from '../jdk.mjs'

export const name = 'jdk'
export const summary = 'Liste les JDK détectés ou en télécharge un (8, 17, 21, 25) dans ~/.local/tools'
export const usage = `bun mod jdk [list | install <${supportedMajors.join('|')}>]`

export async function run(args, { env, log }) {
	const [action = 'list', major] = args
	if (action === 'install') {
		if (!major) throw new Error(`Usage : ${usage}`)
		const jdk = await installJdk(Number(major), { log: message => log.info(message) })
		log.info(`JDK ${jdk.major} installé : ${jdk.home}`)
		return 0
	}
	if (action !== 'list') throw new Error(`Usage : ${usage}`)
	const jdks = await detectJdks({ env })
	const gradle = pickGradleJdk(jdks)
	for (const jdk of jdks) log.info(`${String(jdk.major).padStart(3)}  ${jdk.home}${jdk === gradle ? '  (Gradle)' : ''}`)
	if (!gradle) log.warn(`Aucun JDK ${minimumGradleJava}+ pour Gradle : bun mod jdk install ${minimumGradleJava}`)
	return 0
}
