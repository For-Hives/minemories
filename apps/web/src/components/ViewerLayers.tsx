import { type RefObject, useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18n'
import type { GlbCategory } from '../lib/glb-categories'
import type { ViewerScene } from '../viewer-scene'

/** Switches for the categories of a GLB format 2 capture; nothing is shown for a single layer. */
export function ViewerLayers({ sceneRef, ready }: { sceneRef: RefObject<ViewerScene | null>; ready: boolean }) {
	const { t } = useI18n()
	const [layers, setLayers] = useState<GlbCategory[]>([])
	const [hidden, setHidden] = useState<GlbCategory[]>([])
	useEffect(() => {
		if (!ready) return
		const scene = sceneRef.current
		const present = scene?.categories() ?? []
		setLayers(present)
		setHidden(present.filter(category => !scene?.isCategoryVisible(category)))
	}, [ready, sceneRef])
	if (layers.length < 2) return null
	const labels: Record<GlbCategory, string> = {
		terrain: t('Terrain'),
		decor: t('Plants and decor'),
		fluids: t('Water and lava'),
		block_entities: t('Chests, beds and signs'),
		entities: t('Creatures'),
	}
	return (
		<fieldset disabled={!ready} className="viewer-layers">
			<legend>{t('Layers')}</legend>
			{layers.map(category => (
				<button
					type="button"
					key={category}
					aria-pressed={!hidden.includes(category)}
					onClick={() => {
						const visible = hidden.includes(category)
						sceneRef.current?.setCategoryVisible(category, visible)
						setHidden(visible ? hidden.filter(item => item !== category) : [...hidden, category])
					}}
				>
					{labels[category]}
				</button>
			))}
		</fieldset>
	)
}
