import * as z from 'zod'

/** Identifiant de cible : `<loader>-mc<minecraft>`, ex. `fabric-mc1.21.11`. */
export const modTargetId = z.string().regex(/^[a-z]+-mc[0-9][A-Za-z0-9.]*$/)
export const modVersion = z.string().regex(/^[0-9][A-Za-z0-9.+-]*$/)

export const modIndexVersion = z.object({
	version: modVersion,
	builtAt: z.string(),
	commit: z.string(),
	bytes: z.number().int().nonnegative(),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	/** Clé de l'objet dans le bucket : `mods/<targetId>/<version>/<jar>`. */
	key: z.string(),
	/** Machine qui a compilé le JAR (les octets peuvent différer entre le PC et le VPS). Absent des anciennes entrées. */
	builtBy: z.enum(['pc', 'vps']).optional(),
	pinned: z.boolean().optional(),
	published: z.object({ modrinth: z.string().optional(), curseforge: z.string().optional() }).optional(),
})
export const modIndexTarget = z.object({
	loader: z.string(),
	minecraft: z.string(),
	loaderVersion: z.string(),
	java: z.string(),
	fabricApi: z.string().optional(),
	latest: modVersion,
	/** De la plus récente à la plus ancienne. */
	versions: z.array(modIndexVersion).min(1),
})
/** `index.json` du bucket des JAR du mod, servi par `GET /downloads/index.json`. */
export const modIndex = z.object({
	schema: z.literal(1),
	generatedAt: z.string(),
	targets: z.record(modTargetId, modIndexTarget),
})

export type ModIndex = z.infer<typeof modIndex>
export type ModIndexTarget = z.infer<typeof modIndexTarget>
export type ModIndexVersion = z.infer<typeof modIndexVersion>

/** Nom de distribution d'un JAR (en-tête Content-Disposition). */
export const modJarName = (targetId: string, version: string) => `minemories-${targetId}-${version}.jar`
