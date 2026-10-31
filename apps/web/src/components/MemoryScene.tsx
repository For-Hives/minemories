import { useId } from 'react'
import type { DemoTheme } from '../content/discovery'

function House({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
	return (
		<g transform={`translate(${x} ${y}) scale(${small ? 0.65 : 1})`}>
			<path d="M0 0 48 24 48 72 0 48Z" fill="#ab7954" />
			<path d="M48 24 96 0 96 48 48 72Z" fill="#805943" />
			<path d="M-7 2 44-32 103 2 48 30Z" fill="#d79b71" />
			<path d="M44-32 48 30 103 2Z" fill="#9e644d" />
			<path d="M18 25 32 32 32 47 18 40Z" fill="#f5d584" />
			<path d="M64 36 79 29 79 51 64 58Z" fill="#4b443d" />
		</g>
	)
}
function Tree({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<path d="M-3 0H4V26H-3Z" fill="#725638" />
			<path d="M0-46 24 1 0 12-24 1Z" fill="#557e58" />
			<path d="M0-46V12L24 1Z" fill="#365d43" />
		</g>
	)
}
export function MemoryScene({
	theme = 'home',
	stage = 3,
	label,
}: {
	theme?: DemoTheme
	stage?: number
	label: string
}) {
	const id = useId()
	return (
		<svg className={`mm-memory-scene mm-scene-${theme}`} viewBox="0 0 480 320" role="img" aria-label={label}>
			<defs>
				<radialGradient id={id}>
					<stop stopColor={theme === 'garden' ? '#8c716044' : '#80b3a644'} />
					<stop offset="1" stopColor="#1b272000" />
				</radialGradient>
			</defs>
			<rect width="480" height="320" fill={`url(#${id})`} />
			<g className="mm-memory-island">
				<ellipse cx="242" cy="275" rx="154" ry="20" fill="#070d0955" />
				<path d="M67 171 237 256 414 168 414 199 237 288 67 202Z" fill="#534738" />
				<path d="M67 171 240 86 414 168 237 256Z" fill={theme === 'garden' ? '#809064' : '#718f63'} />
				<path d="M237 256V288L414 199V168Z" fill="#3d3d2d" />
				<path d="M155 127 193 109 356 197 316 217Z" fill="#6fa7a3" />
				<Tree x={126} y={156} />
				<Tree x={342} y={161} />
				{stage > 1 && <Tree x={296} y={121} />}
				{theme !== 'garden' && <House x={195} y={149} />}
				{theme === 'village' && stage > 1 && <House x={284} y={178} small />}
				{theme === 'village' && stage > 2 && <House x={137} y={180} small />}
				{theme === 'home' && stage > 1 && <path d="m169 201 42 22 20-10-42-22Z" fill="#d6c297" />}
				{theme === 'garden' &&
					[0, 1, 2, 3, 4].slice(0, stage + 2).map(n => (
						<g key={n} transform={`translate(${185 + n * 22} ${170 + (n % 2) * 23})`}>
							<path d="M0 0V16" stroke="#305140" strokeWidth="3" />
							<path d="m0-8 8 7-8 7-8-7Z" fill={n % 2 ? '#d9bd71' : '#dda1ac'} />
						</g>
					))}
				{stage > 2 && <Tree x={220} y={219} />}
			</g>
			<g className="mm-scene-spark" stroke="#d9f36c" opacity=".65">
				<path d="M387 86v14m-7-7h14M100 101v10m-5-5h10" />
			</g>
		</svg>
	)
}
