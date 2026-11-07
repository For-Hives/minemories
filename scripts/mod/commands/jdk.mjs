import { detectJdks, installJdk, minimumGradleJava, pickGradleJdk, supportedMajors } from '../jdk.mjs'

export const name = 'jdk'
export const summary = 'Lists detected JDKs or downloads one (8, 17, 21, 25) into ~/.local/tools'
export const usage = `bun mod jdk [list | install <${supportedMajors.join('|')}>]`

export async function run(args, { env, log }) {
	const [action = 'list', major] = args
	if (action === 'install') {
		if (!major) throw new Error(`Usage: ${usage}`)
		const jdk = await installJdk(Number(major), { log: message => log.info(message) })
		log.info(`JDK ${jdk.major} installed: ${jdk.home}`)
		return 0
	}
	if (action !== 'list') throw new Error(`Usage: ${usage}`)
	const jdks = await detectJdks({ env })
	const gradle = pickGradleJdk(jdks)
	for (const jdk of jdks) log.info(`${String(jdk.major).padStart(3)}  ${jdk.home}${jdk === gradle ? '  (Gradle)' : ''}`)
	if (!gradle) log.warn(`No JDK ${minimumGradleJava}+ for Gradle: bun mod jdk install ${minimumGradleJava}`)
	return 0
}
