import * as z from 'zod'

/** Target identifier: `<loader>-mc<minecraft>`, e.g. `fabric-mc1.21.11`. */
export const modTargetId = z.string().regex(/^[a-z]+-mc[0-9][A-Za-z0-9.]*$/)
export const modVersion = z.string().regex(/^[0-9][A-Za-z0-9.+-]*$/)

export const modIndexVersion = z.object({
	version: modVersion,
	builtAt: z.string(),
	commit: z.string(),
	bytes: z.number().int().nonnegative(),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	/** Object key in the bucket: `mods/<targetId>/<version>/<jar>`. */
	key: z.string(),
	/** Machine that built the JAR (bytes may differ between the PC and the VPS). Missing from older entries. */
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
	/** Newest first. */
	versions: z.array(modIndexVersion).min(1),
})
/** `index.json` of the mod JAR bucket, served by `GET /downloads/index.json`. */
export const modIndex = z.object({
	schema: z.literal(1),
	generatedAt: z.string(),
	targets: z.record(modTargetId, modIndexTarget),
})

export type ModIndex = z.infer<typeof modIndex>
export type ModIndexTarget = z.infer<typeof modIndexTarget>
export type ModIndexVersion = z.infer<typeof modIndexVersion>

/** Distribution file name of a JAR (Content-Disposition header). */
export const modJarName = (targetId: string, version: string) => `minemories-${targetId}-${version}.jar`

export const modBuiltBy = z.enum(['pc', 'vps'])
const hexCommit = /^[0-9a-f]{7,64}$/
const versionLike = /^[0-9A-Za-z][\w.+-]{0,63}$/
/**
 * Build manifest attached to an upload (`X-Mod-Manifest`, base64url-encoded JSON): a subset of the
 * `manifest.json` produced by `bun mod build`. Other fields are ignored.
 */
export const modUploadManifest = z.object({
	id: modTargetId,
	version: modVersion,
	minecraft: z.string().regex(/^[0-9][A-Za-z0-9.]{0,31}$/),
	loader: z.string().regex(/^[a-z]{1,32}$/),
	loaderVersion: z.string().regex(versionLike),
	java: z.string().regex(/^[0-9]{1,2}$/),
	fabricApi: z.string().regex(versionLike).optional(),
	commit: z.string().regex(hexCommit),
	builtAt: z.iso.datetime(),
	builtBy: modBuiltBy,
})
export type ModUploadManifest = z.infer<typeof modUploadManifest>
