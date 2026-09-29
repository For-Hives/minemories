import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { buttonDark, buttonOutline, Eyebrow, fileInputHidden, useAppContext } from '../App'

export function ViewerPage() {
	const { viewerFile, setViewerFile } = useAppContext()
	const [search] = useSearchParams()
	const navigate = useNavigate()
	const frame = useRef<HTMLIFrameElement>(null)
	const latestFile = useRef(viewerFile)
	const lastSentFile = useRef<File | null>(null)
	const [frameReady, setFrameReady] = useState(false)
	const memoryId = search.get('memory')
	latestFile.current = viewerFile

	const sendFileToViewer = useCallback(() => {
		if (!latestFile.current || latestFile.current === lastSentFile.current) return
		frame.current?.contentWindow?.postMessage({ type: 'load-glb', file: latestFile.current }, window.location.origin)
		lastSentFile.current = latestFile.current
	}, [])

	useEffect(() => {
		if (frameReady && viewerFile) sendFileToViewer()
	}, [frameReady, sendFileToViewer, viewerFile])

	return (
		<section className="mx-auto w-[min(100%-88px,1360px)] px-0 py-[37px] pb-[27px] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)] max-phone:py-[25px] max-phone:pb-[19px]">
			<div className="flex items-center justify-between gap-5 pb-[19px] max-phone:flex-col max-phone:items-start max-phone:gap-[13px]">
				<div>
					<Eyebrow>3D EXPLORATION</Eyebrow>
					<h1 className="mb-0 mt-[6px] max-w-[640px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[21px] font-bold tracking-[-0.8px] max-phone:max-w-[calc(100vw-40px)] max-phone:text-lg">
						{viewerFile?.name ?? (memoryId ? 'A world to find again.' : 'A world to revisit.')}
					</h1>
				</div>
				<div className="flex gap-[9px]">
					<label
						className={`${buttonOutline} relative min-h-[40px] text-[10px] focus-within:outline-2 focus-within:outline-[#607a4a] focus-within:outline-offset-[3px]`}
					>
						Choose a GLB
						<input
							id="local-file-input"
							type="file"
							accept=".glb,model/gltf-binary"
							className={fileInputHidden}
							onChange={event => {
								const file = event.currentTarget.files?.[0]
								if (file) {
									setViewerFile(file)
									navigate('/viewer', { replace: true })
								}
								event.currentTarget.value = ''
							}}
						/>
					</label>
					<Link className={`${buttonDark} min-h-[40px] text-[10px]`} to="/gallery">
						My gallery <span>↗</span>
					</Link>
				</div>
			</div>
			<div className="h-[min(68vw,690px)] min-h-[420px] overflow-hidden rounded-lg border border-[#d6d8cd] bg-night shadow-[0_16px_45px_#26312316] max-phone:h-[68vh] max-phone:min-h-[370px]">
				<iframe
					key={memoryId ?? 'local'}
					ref={frame}
					title="Exploring the world in three dimensions"
					src={`/viewer.html?embed=1${memoryId ? `&memory=${encodeURIComponent(memoryId)}` : ''}`}
					className="block h-full w-full border-0"
					onLoad={() => {
						lastSentFile.current = null
						setFrameReady(true)
						sendFileToViewer()
					}}
				/>
			</div>
			<p className="mb-0 mt-[14px] flex items-center justify-center gap-[10px] text-[10px] text-[#85897d] max-phone:flex-wrap max-phone:gap-[7px] max-phone:text-[8px]">
				<span className="text-[15px] text-[#60794a]">⌖</span> Drag to orbit{' '}
				<i className="h-[3px] w-[3px] rounded-full bg-[#b2b5a8] not-italic" /> Scroll to zoom{' '}
				<i className="h-[3px] w-[3px] rounded-full bg-[#b2b5a8] not-italic" /> Right-click to pan
			</p>
		</section>
	)
}
