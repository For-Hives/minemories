// The installation's illustration: the landing's chalet (public/hero/scenes/) and the file of the current step, in an item slot.
export function InstallationScene({ step }: { step: number }) {
	return (
		<div className="install-scene" aria-hidden="true">
			<img src="/hero/scenes/chalet.webp" alt="" width="894" height="720" decoding="async" />
			<span className="install-file">{step >= 4 ? '.glb' : '.jar'}</span>
		</div>
	)
}
