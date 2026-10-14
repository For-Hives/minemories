import { Database } from 'bun:sqlite'
import { realpath } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const integer = /^\d+$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function runDiagnosticsCli(
	args: string[],
	databasePath = process.env.DATABASE_PATH ?? './data/minemories.sqlite'
) {
	const { values } = parseArgs({
		args,
		strict: true,
		allowPositionals: false,
		options: {
			reports: { type: 'boolean' },
			limit: { type: 'string' },
			device: { type: 'string' },
			help: { type: 'boolean' },
		},
	})
	if (values.help)
		return {
			usage:
				'Groupes privés : [--limit 1..1000] [--device UUID]. Rapports assainis : --reports. DATABASE_PATH doit désigner une base existante.',
		}
	const limit = Number(values.limit ?? 100)
	if (!(integer.test(values.limit ?? '100') && Number.isSafeInteger(limit)) || limit < 1 || limit > 1000)
		throw new Error('Invalid diagnostic listing limit.')
	if (values.device && !uuid.test(values.device)) throw new Error('Invalid device identifier.')
	const database = new Database(await realpath(databasePath), { readonly: true, create: false })
	try {
		const filter = values.device ? ' WHERE device_id = ?' : ''
		const parameters = values.device ? [values.device, limit] : [limit]
		if (values.reports)
			return {
				mode: 'reports',
				reports: database
					.query(`SELECT id, device_id AS deviceId,
		 received_at AS receivedAt, fingerprint, report_json AS reportJson FROM diagnostic_reports${filter}
		 ORDER BY received_at DESC, rowid DESC LIMIT ?`)
					.all(...parameters),
			}
		return {
			mode: 'groups',
			groups: database
				.query(`SELECT fingerprint, COUNT(*) AS count,
		 MIN(received_at) AS firstReceivedAt, MAX(received_at) AS lastReceivedAt,
		 json_extract(report_json, '$.source') AS source, json_extract(report_json, '$.phase') AS phase,
		 json_extract(report_json, '$.exception.type') AS exceptionType
		 FROM diagnostic_reports${filter} GROUP BY fingerprint ORDER BY count DESC, fingerprint LIMIT ?`)
				.all(...parameters),
		}
	} finally {
		database.close()
	}
}
export async function executeDiagnosticsCli(args: string[], databasePath?: string): Promise<number> {
	try {
		process.stdout.write(`${JSON.stringify(await runDiagnosticsCli(args, databasePath))}\n`)
		return 0
	} catch {
		console.error(
			'Consultation interrompue. Vérifie les options et la base privée existante. Aucun rapport ni fichier n’a été modifié.'
		)
		return 1
	}
}
if (import.meta.main) process.exitCode = await executeDiagnosticsCli(Bun.argv.slice(2))
