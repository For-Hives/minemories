import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { repositoryRoot } from '../release-utils.mjs'
import { parseArgs } from './args.mjs'
import { discoverCommands, helpText, main } from './cli.mjs'

const capture = () => {
	const out = { info: [], warn: [], error: [] }
	return {
		out,
		log: { info: m => out.info.push(m), warn: m => out.warn.push(m), error: m => out.error.push(m) },
	}
}

async function commandsFolder() {
	const dir = await mkdtemp(join(tmpdir(), 'mod-commands-'))
	const ok = (name, body) =>
		writeFile(
			join(dir, `${name}.mjs`),
			`export const name='${name}';export const summary='${name} summary';export const usage='bun mod ${name}';${body}`
		)
	await ok(
		'alpha',
		'export async function run(args, ctx){ ctx.log.info(["alpha", args.join(","), Object.keys(ctx).sort()].join(" ")); return 3 }'
	)
	await ok('beta', 'export async function run(){ throw new Error("beta exploded") }')
	await writeFile(join(dir, 'gamma.mjs'), 'throw new Error("syntax problem")')
	await writeFile(join(dir, 'README.txt'), 'ignored')
	return dir
}

test('commands are discovered from the folder, broken ones are flagged', async () => {
	const dir = await commandsFolder()
	const commands = await discoverCommands(dir)
	assert.deepEqual(
		commands.map(c => c.name),
		['alpha', 'beta', 'gamma']
	)
	assert.equal(commands[2].broken, true)
	assert.match(helpText(commands), /alpha {2}alpha summary/)
})

test('main dispatches with the documented context and propagates exit codes', async () => {
	const dir = await commandsFolder()
	const { out, log } = capture()
	const options = { root: repositoryRoot, dir, log, env: { X: '1' } }
	assert.equal(await main(['alpha', 'one', 'two'], options), 3)
	assert.equal(out.info[0], 'alpha one,two config,env,log,root')
	assert.equal(await main(['beta'], options), 1)
	assert.equal(out.error.at(-1), 'beta exploded')
	assert.equal(await main(['gamma'], options), 1)
	assert.match(out.error.at(-1), /indisponible/)
	assert.equal(await main(['nope'], options), 1)
	assert.match(out.error.at(-1), /Commande inconnue : nope/)
	assert.equal(await main(['alpha', '--help'], options), 0)
	assert.match(out.info.at(-1), /Usage : bun mod alpha/)
	assert.equal(await main([], options), 0)
	assert.match(out.info.at(-1), /Commandes :/)
})

test('parseArgs separates positionals, flags and valued options', () => {
	assert.deepEqual(
		parseArgs(
			['forge', '1.18.2', '--dev', '--bump', 'patch', '--x=y', '--loader-version=1'],
			['bump', 'x', 'loader-version']
		),
		{
			positionals: ['forge', '1.18.2'],
			flags: { dev: true, bump: 'patch', x: 'y', 'loader-version': '1' },
		}
	)
})

test('the real CLI lists every shipped command and prints the status grid', () => {
	const help = spawnSync('node', ['scripts/mod/cli.mjs'], { cwd: repositoryRoot, encoding: 'utf8' })
	assert.equal(help.status, 0)
	for (const name of ['build', 'status', 'release', 'jdk', 'version', 'open', 'ci'])
		assert.match(help.stdout, new RegExp(`\\n  ${name} `))
	const status = spawnSync('node', ['scripts/mod/cli.mjs', 'status', '--no-storage'], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	})
	assert.equal(status.status, 0)
	assert.match(status.stdout, /Minecraft {3}fabric/)
	const version = spawnSync('node', ['scripts/mod/cli.mjs', 'version'], { cwd: repositoryRoot, encoding: 'utf8' })
	assert.match(version.stdout, /^\d+\.\d+\.\d+-beta\.\d+\n$/)
})
