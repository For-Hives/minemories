import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/server'

type State = 'private' | 'pending' | 'approved' | 'rejected' | 'revoked'
interface Publication {
	id: string
	memory_id: string
	user_id: string
	title: string
	description: string
	category: 'build' | 'landscape' | 'adventure' | 'other'
	thumbnail: string | null
	state: State
	submitted_at: number
	reason: string | null
	votes: number
	voted: number
}
interface PublishInput {
	memoryId: string
	title: string
	description: string
	category: Publication['category']
	thumbnail: string | null
}
const PAGE_SIZE = 24
const HOUR = 3_600_000
const selectPublication = `SELECT p.*, (SELECT COUNT(*) FROM public_votes v WHERE v.publication_id=p.id) AS votes,
 EXISTS(SELECT 1 FROM public_votes v WHERE v.publication_id=p.id AND v.user_id=?) AS voted
 FROM public_publications p JOIN memories m ON m.id=p.memory_id AND m.deleted_at IS NULL`

export function migrateDiscovery(db: Database) {
	db.exec(`CREATE TABLE IF NOT EXISTS public_publications (
 id TEXT PRIMARY KEY, memory_id TEXT NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
 thumbnail TEXT, state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected','revoked')),
 submitted_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT, reason TEXT
 );
 CREATE INDEX IF NOT EXISTS public_publications_state_idx ON public_publications(state, submitted_at DESC);
 CREATE TABLE IF NOT EXISTS public_votes (
 publication_id TEXT NOT NULL REFERENCES public_publications(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(publication_id,user_id));
 CREATE TABLE IF NOT EXISTS public_reports (
 publication_id TEXT NOT NULL REFERENCES public_publications(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(publication_id,user_id));
 CREATE TABLE IF NOT EXISTS public_action_limits (
 user_id TEXT NOT NULL, action TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL,
 PRIMARY KEY(user_id,action));
 CREATE TRIGGER IF NOT EXISTS revoke_publication_on_trash AFTER UPDATE OF deleted_at ON memories
 WHEN NEW.deleted_at IS NOT NULL BEGIN
 UPDATE public_publications SET state='revoked', reason=NULL WHERE memory_id=NEW.id;
 DELETE FROM public_votes WHERE publication_id IN (SELECT id FROM public_publications WHERE memory_id=NEW.id);
 DELETE FROM public_reports WHERE publication_id IN (SELECT id FROM public_publications WHERE memory_id=NEW.id);
 END;`)
}

function capture(row: Publication) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		category: row.category,
		thumbnail: row.thumbnail,
		publishedAt: new Date(row.submitted_at).toISOString(),
		votes: row.votes,
		voted: !!row.voted,
	}
}
function status(row: Pick<Publication, 'id' | 'state' | 'reason'> | null) {
	return { id: row?.id ?? null, state: row?.state ?? ('private' as State), reason: row?.reason ?? null }
}

export class PublicDiscovery {
	constructor(
		private readonly db: Database,
		private readonly moderators: ReadonlySet<string>,
		private readonly now = Date.now
	) {}

	isModerator(userId: string | null) {
		return userId !== null && this.moderators.has(userId)
	}

	private moderator(userId: string | null) {
		if (!this.isModerator(userId)) throw new ORPCError('FORBIDDEN')
	}

	private owner(userId: string, memoryId: string) {
		if (
			!this.db.query('SELECT 1 FROM memories WHERE id=? AND user_id=? AND deleted_at IS NULL').get(memoryId, userId)
		) {
			throw new ORPCError('NOT_FOUND')
		}
	}

	private limit(userId: string, action: string, maximum: number) {
		const bucket = Math.floor(this.now() / HOUR)
		// At most one durable counter per account/action; stale counters are removed in bounded batches.
		this.db
			.query(`DELETE FROM public_action_limits WHERE rowid IN
 (SELECT rowid FROM public_action_limits WHERE bucket < ? LIMIT 100)`)
			.run(bucket - 24)
		const allowed = this.db
			.query(`INSERT INTO public_action_limits VALUES (?,?,?,1)
 ON CONFLICT(user_id,action) DO UPDATE SET bucket=excluded.bucket,
 count=CASE WHEN bucket=excluded.bucket THEN count+1 ELSE 1 END
 WHERE bucket!=excluded.bucket OR count<? RETURNING count`)
			.get(userId, action, bucket, maximum)
		if (!allowed) throw new ORPCError('TOO_MANY_REQUESTS')
	}

	list(
		userId: string | null,
		input: { query: string; category?: Publication['category'] | undefined; sort: 'recent' | 'votes'; page: number }
	) {
		const order = input.sort === 'votes' ? 'votes DESC, p.submitted_at DESC, p.id' : 'p.submitted_at DESC, p.id'
		// User text remains a parameter; instr gives literal search without LIKE wildcards.
		const rows = this.db
			.query(`${selectPublication} WHERE p.state='approved'
 AND (? IS NULL OR p.category=?) AND instr(lower(p.title || ' ' || p.description),lower(?))>0
 ORDER BY ${order} LIMIT ? OFFSET ?`)
			.all(
				userId,
				input.category ?? null,
				input.category ?? null,
				input.query,
				PAGE_SIZE + 1,
				input.page * PAGE_SIZE
			) as Publication[]
		return { items: rows.slice(0, PAGE_SIZE).map(capture), hasMore: rows.length > PAGE_SIZE }
	}

	private publication(id: string, userId: string | null, reviewing = false) {
		const row = this.db.query(`${selectPublication} WHERE p.id=?`).get(userId, id) as Publication | null
		if (!row || (row.state !== 'approved' && !(reviewing && this.isModerator(userId) && row.state !== 'revoked'))) {
			throw new ORPCError('NOT_FOUND')
		}
		return row
	}

	review(id: string, userId: string | null) {
		this.moderator(userId)
		return capture(this.publication(id, userId, true))
	}

	get(id: string, userId: string | null) {
		return capture(this.publication(id, userId))
	}

	file(id: string, userId: string | null) {
		const row = this.publication(id, userId, true)
		return this.db.query('SELECT object_key FROM memories WHERE id=? AND deleted_at IS NULL').get(row.memory_id) as {
			object_key: string
		}
	}

	status(userId: string, memoryId: string) {
		this.owner(userId, memoryId)
		return status(
			this.db
				.query('SELECT id,state,reason FROM public_publications WHERE memory_id=?')
				.get(memoryId) as Publication | null
		)
	}

	publish(userId: string, input: PublishInput) {
		return this.db
			.transaction(() => {
				this.owner(userId, input.memoryId)
				this.limit(userId, 'publish', 5)
				// A new immutable candidate gets a new ID; old approvals, reports and votes cannot carry over.
				this.db.query('DELETE FROM public_publications WHERE memory_id=?').run(input.memoryId)
				const id = randomUUID()
				this.db
					.query(`INSERT INTO public_publications
 (id,memory_id,user_id,title,description,category,thumbnail,state,submitted_at) VALUES (?,?,?,?,?,?,?,'pending',?)`)
					.run(id, input.memoryId, userId, input.title, input.description, input.category, input.thumbnail, this.now())
				return { id, state: 'pending' as const, reason: null }
			})
			.immediate()
	}

	revoke(userId: string, memoryId: string) {
		return this.db
			.transaction(() => {
				this.owner(userId, memoryId)
				this.db.query("UPDATE public_publications SET state='revoked',reason=NULL WHERE memory_id=?").run(memoryId)
				this.db
					.query(
						'DELETE FROM public_votes WHERE publication_id IN (SELECT id FROM public_publications WHERE memory_id=?)'
					)
					.run(memoryId)
				this.db
					.query(
						'DELETE FROM public_reports WHERE publication_id IN (SELECT id FROM public_publications WHERE memory_id=?)'
					)
					.run(memoryId)
				return this.status(userId, memoryId)
			})
			.immediate()
	}

	vote(userId: string, id: string, voted: boolean) {
		return this.db
			.transaction(() => {
				const row = this.publication(id, userId)
				if (row.user_id === userId)
					throw new ORPCError('FORBIDDEN', { message: 'You cannot vote for your own publication.' })
				if (!!row.voted === voted) return { votes: row.votes, voted }
				this.limit(userId, 'vote', 30)
				if (voted) this.db.query('INSERT INTO public_votes VALUES (?,?,?)').run(id, userId, this.now())
				else this.db.query('DELETE FROM public_votes WHERE publication_id=? AND user_id=?').run(id, userId)
				return { votes: row.votes + (voted ? 1 : -1), voted }
			})
			.immediate()
	}

	report(userId: string, id: string, reason: string) {
		return this.db
			.transaction(() => {
				this.publication(id, userId)
				this.limit(userId, 'report', 10)
				this.db
					.query(`INSERT INTO public_reports VALUES (?,?,?,?) ON CONFLICT(publication_id,user_id)
 DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at`)
					.run(id, userId, reason, this.now())
				return { ok: true as const }
			})
			.immediate()
	}

	queue(userId: string | null, input: { state: 'pending' | 'approved' | 'rejected' | 'reported'; page: number }) {
		this.moderator(userId)
		const state = input.state === 'reported' ? 'approved' : input.state
		const rows = this.db
			.query(`${selectPublication} WHERE p.state=?
 AND (?=0 OR EXISTS(SELECT 1 FROM public_reports r WHERE r.publication_id=p.id))
 ORDER BY p.submitted_at,p.id LIMIT ? OFFSET ?`)
			.all(userId, state, Number(input.state === 'reported'), PAGE_SIZE + 1, input.page * PAGE_SIZE) as Publication[]
		return {
			items: rows.slice(0, PAGE_SIZE).map(row => ({
				...capture(row),
				memoryId: row.memory_id,
				state: row.state,
				reason: row.reason,
				reports: (
					this.db
						.query(`SELECT rowid AS id,reason,created_at FROM public_reports
 WHERE publication_id=? ORDER BY created_at DESC,user_id LIMIT 20`)
						.all(row.id) as { id: number; reason: string; created_at: number }[]
				).map(report => ({
					id: report.id,
					reason: report.reason,
					createdAt: new Date(report.created_at).toISOString(),
				})),
			})),
			hasMore: rows.length > PAGE_SIZE,
		}
	}

	moderate(userId: string | null, id: string, decision: 'approved' | 'rejected', reason: string) {
		this.moderator(userId)
		return this.db
			.transaction(() => {
				const row = this.publication(id, userId, true)
				if (row.user_id === userId)
					throw new ORPCError('FORBIDDEN', { message: 'Another moderator must review your publication.' })
				this.db
					.query('UPDATE public_publications SET state=?,reason=?,reviewed_at=?,reviewed_by=? WHERE id=?')
					.run(decision, reason || null, this.now(), userId, id)
				this.db.query('DELETE FROM public_reports WHERE publication_id=?').run(id)
				return { id, state: decision, reason: reason || null }
			})
			.immediate()
	}
}
