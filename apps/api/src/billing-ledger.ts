import type { Database } from 'bun:sqlite'
import type { BillingConfig } from './billing-config'

const sha256Pattern = /^[a-f0-9]{64}$/

export interface BillingDelivery {
	id: string
	sha256: string
}
interface Projection {
	id: string
	userId: string
	kind: 'order' | 'subscription'
	productId: string | null
	status: string
	paid: boolean
	revision: number
}
function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
function text(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null
}
function date(value: unknown): number {
	let result = NaN
	if (value instanceof Date) result = value.getTime()
	if (typeof value === 'string') result = Date.parse(value)
	if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid Polar event revision.')
	return result
}
/** Minimal owner-scoped billing cache, never a grant of storage or capture rights. */
export class BillingLedger {
	constructor(
		private readonly database: Database,
		private readonly config: BillingConfig
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS billing_target (id INTEGER PRIMARY KEY CHECK(id=1), environment TEXT NOT NULL, organization_id TEXT NOT NULL);
		 CREATE TABLE IF NOT EXISTS billing_events (delivery_id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,event_type TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,resource_id TEXT NOT NULL,created_at INTEGER NOT NULL);
		 CREATE TABLE IF NOT EXISTS billing_resources (resource_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,kind TEXT NOT NULL,product_id TEXT,status TEXT NOT NULL,paid INTEGER NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(resource_id,kind));`)
		database
			.transaction(() => {
				const previous = database.query('SELECT environment,organization_id FROM billing_target WHERE id=1').get() as {
					environment: string
					organization_id: string
				} | null
				if (
					previous &&
					(previous.environment !== config.environment || previous.organization_id !== config.organizationId)
				)
					throw new Error('Polar billing target changed; an explicit migration is required.')
				database
					.query('INSERT OR IGNORE INTO billing_target VALUES (1,?,?)')
					.run(config.environment, config.organizationId)
			})
			.immediate()
	}

	accept(delivery: BillingDelivery, event: unknown): boolean {
		const payload = object(event),
			type = text(payload.type)
		if (!(type && (type.startsWith('order.') || type.startsWith('subscription.')))) return false
		if (!(text(delivery.id) && sha256Pattern.test(delivery.sha256))) throw new Error('Invalid Polar delivery identity.')
		const data = object(payload.data),
			customer = object(data.customer)
		if (customer.organization_id !== this.config.organizationId) throw new Error('Unexpected Polar organization.')
		const id = text(data.id),
			userId = text(customer.external_id)
		if (!(id && userId && this.database.query('SELECT 1 FROM user WHERE id=?').get(userId))) return false
		const projection: Projection = {
			id,
			userId,
			kind: type.startsWith('order.') ? 'order' : 'subscription',
			productId: text(data.product_id),
			status: text(data.status) ?? 'unknown',
			paid: data.paid === true,
			revision: date(data.modified_at ?? payload.timestamp),
		}
		return this.database.transaction(() => this.store(delivery, type, projection)).immediate()
	}

	private store(delivery: BillingDelivery, type: string, value: Projection): boolean {
		const previous = this.database.query('SELECT sha256 FROM billing_events WHERE delivery_id=?').get(delivery.id) as {
			sha256: string
		} | null
		if (previous) {
			if (previous.sha256 !== delivery.sha256) throw new Error('Polar delivery ID reused with different content.')
			return false
		}
		const owner = this.database
			.query('SELECT user_id FROM billing_resources WHERE resource_id=? AND kind=?')
			.get(value.id, value.kind) as {
			user_id: string
		} | null
		if (owner && owner.user_id !== value.userId) throw new Error('Polar resource ownership changed.')
		this.database
			.query('INSERT INTO billing_events VALUES (?,?,?,?,?,?)')
			.run(delivery.id, delivery.sha256, type, value.userId, value.id, value.revision)
		this.database
			.query(
				`INSERT INTO billing_resources VALUES (?,?,?,?,?,?,?) ON CONFLICT(resource_id,kind) DO UPDATE SET product_id=excluded.product_id,status=excluded.status,paid=excluded.paid,revision=excluded.revision WHERE excluded.revision > billing_resources.revision`
			)
			.run(value.id, value.userId, value.kind, value.productId, value.status, Number(value.paid), value.revision)
		return true
	}
}
