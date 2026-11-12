// The welcome screen's illustration: the landing's chalet (public/hero/scenes/) and the mod's file in an item slot.
export function InstallationScene() {
	return (
		<div className="install-scene" aria-hidden="true">
			<img src="/hero/scenes/chalet.webp" alt="" width="894" height="720" decoding="async" />
			<span className="install-file">.jar</span>
		</div>
	)
}
