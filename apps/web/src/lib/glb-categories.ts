/** Categories written by the mod as named nodes (GLB format 2). Older files have none of them. */
export const GLB_CATEGORIES = ['terrain', 'decor', 'fluids', 'block_entities', 'entities'] as const

export type GlbCategory = (typeof GLB_CATEGORIES)[number]

const known = new Set<string>(GLB_CATEGORIES)

export function isGlbCategory(name: string): name is GlbCategory {
	return known.has(name)
}

/** Categories present among the given node names, in the stable display order. */
export function presentCategories(names: Iterable<string>): GlbCategory[] {
	const found = new Set<string>()
	for (const name of names) if (known.has(name)) found.add(name)
	return GLB_CATEGORIES.filter(category => found.has(category))
}

/**
 * A mesh stays hidden while its category is switched off, and otherwise follows its own draw range:
 * a composed world hides meshes it does not draw (`count === 0`), which a toggle must not undo.
 */
export function meshVisible(drawCount: number, categoryHidden: boolean): boolean {
	return !categoryHidden && drawCount !== 0
}
