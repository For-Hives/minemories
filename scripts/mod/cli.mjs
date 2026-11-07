// `bun mod`: single entry point of the mod build, storage, test, publish and notification tooling.
//
// Command contract: every file `scripts/mod/commands/<name>.mjs` exports
//   { name, summary, usage, async run(args, ctx) }
// where `args` is the list of arguments after the command name and
//   ctx = { config, env, log, root }
//     config  the validated mod/targets.json ({ minecraft, targets, planned }, see config.mjs)
//     env     process.env merged with the repository .env (existing variables win)
//     log     callable as log(message) (stdout), plus { info, warn, error } (warn/error on stderr)
//     root    repository root
// `run` returns an exit code (a number; anything else means 0) or throws (message printed, exit code 1).
// Commands are discovered from the folder, so a new command only needs its file.
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readConfig } from './config.mjs'
import { loadEnv } from './env.mjs'
import { isMain, repositoryRoot } from './utils.mjs'

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), 'commands')
const extension = /\.mjs$/
const commandFile = /^[a-z][a-z0-9-]*\.mjs$/

export const consoleLog = {
	info: message => console.log(message),
	warn: message => console.warn(message),
	error: message => console.error(message),
}

/** Loads each command file; one that fails to load is reported as broken instead of crashing the tool. */
export async function discoverCommands(dir = commandsDir) {
	const files = (await readdir(dir)).filter(name => commandFile.test(name)).sort()
	const commands = []
	for (const file of files) {
		try {
			const command = await import(pathToFileURL(join(dir, file)).href)
			if (typeof command.run === 'function') commands.push(command)
		} catch (error) {
			const name = file.replace(extension, '')
			commands.push({ name, summary: `(failed to load: ${error.message})`, broken: true })
		}
	}
	return commands
}

export function helpText(commands) {
	const width = Math.max(...commands.map(c => c.name.length))
	const lines = commands.map(c => `  ${c.name.padEnd(width)}  ${c.summary}`)
	return [
		'Usage: bun mod <command> [options]',
		'',
		'Commands:',
		...lines,
		'',
		'bun mod <command> --help: detailed usage.',
	].join('\n')
}

export async function main(argv, options = {}) {
	const { root = repositoryRoot, dir = commandsDir, log = consoleLog, env: baseEnv } = options
	const [name, ...args] = argv
	const commands = await discoverCommands(dir)
	if (!name || name === 'help' || name === '--help' || name === '-h') {
		log.info(helpText(commands))
		return 0
	}
	const command = commands.find(c => c.name === name)
	if (!command) {
		log.error(`Unknown command: ${name}\n\n${helpText(commands)}`)
		return 1
	}
	if (command.broken) {
		log.error(`Command ${name} unavailable: ${command.summary}`)
		return 1
	}
	if (args.includes('--help') || args.includes('-h')) {
		log.info(`${command.summary}\n\nUsage: ${command.usage}`)
		return 0
	}
	try {
		const env = baseEnv ?? (await loadEnv({ root }))
		// Commands call ctx.log(message) for plain output and ctx.log.warn/error for the rest.
		const commandLog = Object.assign(message => log.info(message), log)
		const code = await command.run(args, { config: await readConfig(root), env, log: commandLog, root })
		return typeof code === 'number' ? code : 0
	} catch (error) {
		log.error(error.message)
		return 1
	}
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
