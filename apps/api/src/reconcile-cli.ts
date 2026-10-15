import { Database } from 'bun:sqlite'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { assertColdStorageIdentity } from './cold-storage-target'
import { applyReconciliationPlan } from './reconciliation-apply'
import { readReconciliationPlan, writeReconciliationPlan } from './reconciliation-files'
import { type StorageInventory, storageInventory } from './storage-inventory'
import type { ReconciliationAction } from './storage-reconciliation'
import { collectReconciliationPlan, type ReconciliationPlan } from './storage-reconciliation-plan'

interface CommandContext {
	databasePath?: string
	inventory?: StorageInventory
}
function counts(plan: ReconciliationPlan): Record<ReconciliationAction, number> {
	const totals = { protected: 0, review: 0, recent: 0, repair: 0, queue: 0, unchanged: 0, gone: 0 }
	for (const entry of plan.entries) totals[entry.proposal.action]++
	return totals
}
function argumentsFor(args: string[]) {
	const { values } = parseArgs({
		args,
		strict: true,
		allowPositionals: false,
		options: {
			plan: { type: 'string' },
			prefix: { type: 'string' },
			apply: { type: 'boolean' },
			'api-stopped': { type: 'boolean' },
			backup: { type: 'string' },
			help: { type: 'boolean' },
		},
	})
	if (!(values.help || values.plan)) throw new Error('Specify --plan with a private JSON file path.')
	if (values.apply && !(values['api-stopped'] && values.backup))
		throw new Error('Applying requires --api-stopped and a new --backup file path.')
	if (values.apply && values.prefix !== undefined) throw new Error('Applying uses the prefix recorded in the plan.')
	return values
}

export async function runReconciliationCli(args: string[], context: CommandContext = {}) {
	const values = argumentsFor(args)
	if (values.help)
		return {
			usage:
				'Inventaire : --plan <nouveau fichier> [--prefix <propriétaire/>]. Application : --plan <fichier> --apply --api-stopped --backup <nouveau fichier SQLite>.',
		}
	const path = await realpath(context.databasePath ?? process.env.DATABASE_PATH ?? './data/minemories.sqlite')
	const inventory = context.inventory ?? storageInventory()
	const database = new Database(
		path,
		values.apply ? { readwrite: true, create: false } : { readonly: true, create: false }
	)
	try {
		assertColdStorageIdentity(database, process.env)
		const planPath = resolve(values.plan as string)
		if (values.apply) {
			const plan = await readReconciliationPlan(planPath)
			const report = await applyReconciliationPlan(database, inventory, plan, {
				databasePath: path,
				backupPath: resolve(values.backup as string),
				apiStopped: values['api-stopped'] === true,
			})
			return {
				mode: 'apply',
				...report,
				cleanup: 'Les objets seront nettoyés par la file durable au redémarrage de l’API.',
			}
		}
		const plan = await collectReconciliationPlan(database, inventory, {
			databasePath: path,
			prefix: values.prefix ?? '',
		})
		await writeReconciliationPlan(planPath, plan)
		return { mode: 'inventory', planPath, entries: plan.entries.length, counts: counts(plan) }
	} finally {
		database.close()
	}
}
export async function executeReconciliationCli(args: string[], context: CommandContext = {}): Promise<number> {
	try {
		process.stdout.write(`${JSON.stringify(await runReconciliationCli(args, context))}\n`)
		return 0
	} catch {
		console.error(
			'Réconciliation interrompue. Vérifie les options, les fichiers, leurs droits et l’accès au stockage. Aucun nettoyage physique n’a été exécuté ; une sauvegarde éventuellement créée reste disponible.'
		)
		return 1
	}
}
if (import.meta.main) process.exitCode = await executeReconciliationCli(Bun.argv.slice(2))
