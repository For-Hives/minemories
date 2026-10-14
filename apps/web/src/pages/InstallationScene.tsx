export function InstallationScene({ step }: { step: number }) {
	return (
		<svg viewBox="0 0 420 300" fill="none" className="install-scene" aria-hidden="true">
			<ellipse cx="208" cy="241" rx="137" ry="26" fill="#d9f36c" opacity=".05" />
			<path
				d="M48 238 208 151 373 238M86 259 248 172M133 278 294 192M45 216 209 300M93 194 255 280M139 172 300 258"
				stroke="#344b3b"
				strokeWidth="1"
			/>
			<g className="install-island">
				<path d="m91 168 114-61 121 61-117 64Z" fill="#526b40" />
				<path d="m91 168 118 64v40L91 208Z" fill="#66513b" />
				<path d="m209 232 117-64v40l-117 64Z" fill="#3e372c" />
				<path d="m107 175 103 55 101-55" stroke="#a4c56e" strokeWidth="3" />
				<path d="m161 143 47-24 48 24v42l-47 25-48-25Z" fill="#b2ab83" />
				<path d="m161 143 47 25v42l-47-25Z" fill="#8b8061" />
				<path d="m208 168 48-25v42l-48 25Z" fill="#615e4b" />
				<path d="m152 144 55-52 59 52-58 30Z" fill="#b9784e" />
				<path d="m152 144 56 30v9l-56-30Z" fill="#875039" />
				<path d="m208 174 58-30v9l-58 30Z" fill="#634432" />
				<path d="m223 173 14-7v19l-14 7Z" fill="#d9f36c" opacity=".9" />
				<path d="m180 174 13 7v19l-13-7Z" fill="#3c4133" />
				<path d="m122 140 9-5v36l-9 5Z" fill="#766147" />
				<path d="m102 118 26-14 28 14v26l-27 14-27-14Z" fill="#3c6144" />
				<path d="m102 118 26 14 28-14-28-14Z" fill="#789455" />
				<path d="m129 132 27-14v26l-27 14Z" fill="#2c4c36" />
			</g>
			<g className="install-orbit" stroke="#d9f36c" strokeWidth="1.5">
				<path d="M65 112V95h17M329 93h17v17M65 197v17h17M346 197v17h-17" />
				<path d="M282 55v12m-6-6h12M87 68v8m-4-4h8" opacity=".65" />
			</g>
			<g className="install-file" transform="translate(294 90)">
				<rect width="67" height="79" rx="9" fill="#1d2e23" stroke="#8fa66c" />
				<path d="M19 15h19l11 11v23H19Z" stroke="#d9f36c" strokeWidth="2" />
				<path d="M38 15v12h11" stroke="#d9f36c" strokeWidth="2" />
				<text x="33" y="66" textAnchor="middle" fill="#e8eee5" fontSize="12" fontFamily="monospace">
					{step >= 4 ? '.glb' : '.jar'}
				</text>
			</g>
			<path className="install-trail" d="M322 179q-5 49-53 59" stroke="#d9f36c" strokeWidth="2" strokeDasharray="4 7" />
		</svg>
	)
}
