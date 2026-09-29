import { Link } from 'react-router'
import { buttonLime, buttonOutline, Eyebrow, useAppContext } from '../App'

export function HomePage() {
	const { session } = useAppContext()

	return (
		<div className="mx-auto w-[min(100%-88px,1360px)] max-tablet:w-[min(100%-48px,760px)] max-phone:w-[calc(100%-36px)]">
			<section className="relative grid min-h-[615px] grid-cols-[1fr_1.03fr] items-center gap-[4.8%] py-[65px] pb-[77px] max-tablet:min-h-[570px] max-tablet:grid-cols-2 max-tablet:gap-[3%] max-phone:min-h-0 max-phone:grid-cols-1 max-phone:gap-[33px] max-phone:py-[47px] max-phone:pb-[59px]">
				<div className="relative z-[1] pb-[3px] pl-[3px]">
					<Eyebrow>TIME PASSES. YOUR WORLDS REMAIN.</Eyebrow>
					<h1 className="mb-[19px] mt-6 font-sans text-[clamp(45px,5.05vw,72px)] font-semibold leading-[1.03] tracking-[-4.9px] text-[#22281f] max-tablet:text-[clamp(42px,6vw,59px)] max-tablet:tracking-[-3.4px] max-phone:mb-[14px] max-phone:mt-5 max-phone:text-[clamp(44px,12vw,60px)] max-phone:tracking-[-3.5px]">
						The worlds
						<br />
						we <em className="font-medium text-[#718650] not-italic">built together.</em>
					</h1>
					<p className="my-4 max-w-[470px] text-[15px] leading-[1.8] text-[#73786d] max-phone:text-[13px]">
						Keep a trace of the places, builds and shared adventures. Revisit them in 3D, without relaunching the server
						or finding the right modpack.
					</p>
					<div className="mt-7 flex flex-wrap gap-[11px] max-phone:mt-[22px] max-phone:gap-2">
						<Link
							className={`${buttonLime} max-phone:min-h-[43px] max-phone:px-[13px] max-phone:text-[10px]`}
							to={session ? '/gallery' : '/register'}
						>
							{session ? 'Find my worlds' : 'Create my space'} <span aria-hidden="true">↗</span>
						</Link>
						<Link
							className={`${buttonOutline} max-phone:min-h-[43px] max-phone:px-[13px] max-phone:text-[10px]`}
							to="/viewer"
						>
							Explore a local file
						</Link>
					</div>
					<div className="mt-7 flex items-center gap-[13px] text-[11px] text-[#85897f] max-phone:mt-5 max-phone:text-[10px]">
						<span className="inline-flex pl-1">
							<i className="-ml-1 grid h-[25px] w-[25px] place-items-center rounded-full border-2 border-paper bg-[#789078] font-mono text-[9px] font-normal not-italic text-white first:ml-0">
								J
							</i>
							<i className="-ml-1 grid h-[25px] w-[25px] place-items-center rounded-full border-2 border-paper bg-[#ba8c68] font-mono text-[9px] font-normal not-italic text-white">
								M
							</i>
							<i className="-ml-1 grid h-[25px] w-[25px] place-items-center rounded-full border-2 border-paper bg-[#708596] font-mono text-[9px] font-normal not-italic text-white">
								A
							</i>
						</span>
						<span>One link to share. One world to find again.</span>
					</div>
				</div>
				<MemoryArtwork />
				<span className="absolute bottom-[30px] left-[3px] font-mono text-[9px] tracking-[0.8px] text-[#8d9187] max-phone:bottom-[21px] max-phone:left-[2px] max-phone:text-[8px]">
					01 — A PLACE FOR YOUR WORLDS
				</span>
			</section>

			<section className="grid min-h-[270px] grid-cols-[1fr_0.7fr] items-center gap-[12%] border-t border-line px-[9%] py-[49px] max-tablet:gap-[7%] max-tablet:px-[3%] max-phone:min-h-0 max-phone:grid-cols-1 max-phone:gap-[15px] max-phone:px-0 max-phone:py-[38px] max-phone:pb-[39px]">
				<div>
					<Eyebrow>AFTER THE LAST LOGIN</Eyebrow>
					<h2 className="mb-0 mt-4 font-sans text-[clamp(32px,3.3vw,46px)] font-semibold tracking-[-2.4px] text-[#22281f] max-phone:text-[35px] max-phone:tracking-[-2px]">
						The backup exists.
						<br />
						<em className="text-[#718650] not-italic">So does the memory.</em>
					</h2>
				</div>
				<div className="grid max-w-[425px] gap-[14px] text-[13px] leading-[1.85] text-[#777c71] max-phone:text-xs">
					<p className="my-4">A server closes, versions change, and the world folder ends up forgotten somewhere.</p>
					<p className="my-4">
						Minemories keeps a light, explorable version of it. The original file stays on your computer; your captures
						can also be found in your private gallery.
					</p>
				</div>
			</section>

			<section
				className="grid grid-cols-3 gap-4 py-[27px] pb-[74px] max-phone:grid-cols-1 max-phone:gap-[9px] max-phone:py-4 max-phone:pb-[46px]"
				aria-label="How it works"
			>
				<StepCard number="01" icon="⌂" title="Capture your spot">
					Pick an area from Minecraft or open a GLB file from your computer.
				</StepCard>
				<StepCard number="02" icon="◌" title="Revisit it">
					Walk around the build in the browser, as if you went back.
				</StepCard>
				<StepCard number="03" icon="↗" title="Show it to others">
					Find your captures in a personal space and share them with your friends.
				</StepCard>
			</section>

			<section className="relative mb-[62px] flex min-h-[230px] items-center justify-between gap-5 overflow-hidden rounded-lg bg-forest px-[7%] py-9 max-phone:mb-[37px] max-phone:min-h-[205px] max-phone:flex-col max-phone:items-start max-phone:justify-center max-phone:gap-5 max-phone:p-6">
				<div className="relative z-[1]">
					<Eyebrow tone="text-[#bed096]">THE NEXT WORLD CAN STAY</Eyebrow>
					<h2 className="mb-0 mt-[14px] font-sans text-[39px] font-semibold tracking-[-2px] text-[#f1f2e8] max-phone:text-[33px]">
						Until next
						<br />
						season.
					</h2>
				</div>
				<Link className={`${buttonLime} relative z-[1]`} to={session ? '/gallery' : '/register'}>
					Keep my first memory <span>↗</span>
				</Link>
				<span
					aria-hidden="true"
					className="absolute top-[-76px] right-[27%] text-[330px] leading-none text-[#ffffff0b] max-phone:top-[-24px] max-phone:right-[4%] max-phone:text-[195px]"
				>
					✳
				</span>
			</section>
		</div>
	)
}

function StepCard({
	number,
	icon,
	title,
	children,
}: {
	number: string
	icon: string
	title: string
	children: string
}) {
	return (
		<div className="relative min-h-[202px] rounded-[7px] border border-[#d9dacf] bg-[#f6f5ef] px-[25px] py-6 max-phone:grid max-phone:min-h-0 max-phone:grid-cols-[43px_1fr_auto] max-phone:gap-x-3 max-phone:p-4">
			<span className="absolute top-6 right-[25px] font-mono text-[10px] text-[#9b9f93] max-phone:top-[17px] max-phone:right-4">
				{number}
			</span>
			<span className="mb-[21px] grid h-[39px] w-[39px] place-items-center rounded-[9px] bg-[#e6ebd9] text-[19px] text-[#5f754d] max-phone:m-0 max-phone:h-[37px] max-phone:w-[37px] max-phone:row-span-2">
				{icon}
			</span>
			<h3 className="mb-[7px] font-sans text-[15px] font-bold tracking-[-0.3px] max-phone:m-0 max-phone:mb-1 max-phone:self-end max-phone:text-[13px]">
				{title}
			</h3>
			<p className="m-0 max-w-[270px] text-[11px] leading-[1.7] text-[#777c71] max-phone:col-[2/-1] max-phone:max-w-none max-phone:text-[10px]">
				{children}
			</p>
		</div>
	)
}

function MemoryArtwork() {
	return (
		<div
			className="relative min-h-[465px] rotate-[0.7deg] overflow-hidden rounded-lg border border-[#d2d3c5] bg-[#e0e3d2] shadow-[0_22px_65px_#37483317] max-tablet:min-h-[380px] max-phone:min-h-[330px] max-phone:rotate-0"
			role="img"
			aria-label="Isometric illustration of a blocky world"
		>
			<div className="absolute inset-x-6 top-[22px] z-[2] flex justify-between font-mono text-[9px] tracking-[0.7px] text-[#626d5d] max-phone:inset-x-[14px] max-phone:top-[15px] max-phone:text-[7px]">
				<span>ARCHIVE No. 008</span>
				<span>SUMMER SEASON · 2024</span>
			</div>
			<div className="absolute top-[77px] right-[17%] h-[46px] w-[46px] rounded-full bg-[#edce86] shadow-[0_0_45px_#ead08c8c]" />
			<div className="absolute inset-x-0 top-[52px] bottom-[54px] grid place-items-center">
				<svg
					viewBox="0 0 560 430"
					role="img"
					aria-label="House by a river, surrounded by trees"
					className="h-full w-full [image-rendering:pixelated]"
				>
					<defs>
						<linearGradient id="artSky" x2="0" y2="1">
							<stop stopColor="#9bc9bf" />
							<stop offset="1" stopColor="#d7dbb8" />
						</linearGradient>
						<linearGradient id="artWater" x2="0" y2="1">
							<stop stopColor="#65aeb1" />
							<stop offset="1" stopColor="#397b80" />
						</linearGradient>
					</defs>
					<path fill="url(#artSky)" d="M25 42h510v288H25z" />
					<path fill="#6f9677" d="M25 258h510v72H25z" />
					<path fill="#7fac80" d="m25 248 72-37 78 28 78-62 62 26 70-51 75 26 75-43v139H25z" />
					<path fill="url(#artWater)" d="m25 285 124-20 88 26 82-13 88 28 128-18v62H25z" />
					<path fill="#dfd2a8" d="m66 302 65-7 43 20-68 9zM260 308l48-5 43 13-52 8zM438 293l47-7 34 8-47 9z" />
					<path fill="#644e3d" d="M187 182h145v109H187z" />
					<path fill="#b18c5c" d="m170 183 88-63 92 63-18 18-74-51-71 50z" />
					<path fill="#6d3d36" d="m250 129 9-9 91 63-17 16z" />
					<path fill="#d2b77e" d="M204 197h50v94h-50z" />
					<path fill="#a36f4c" d="M268 197h49v94h-49z" />
					<path fill="#a6d0c1" d="M214 207h28v26h-28zM277 207h27v26h-27z" />
					<path fill="#39473a" d="M263 244h20v47h-20z" />
					<path fill="#705843" d="M99 193h12v74H99zM384 168h13v89h-13zM448 208h12v64h-12z" />
					<path
						fill="#527957"
						d="m65 197 39-73 42 73-16 7 21 31H53l24-31zM353 171l38-76 44 76-17 8 24 37h-99l23-37zM420 211l34-59 39 59-12 7 18 29h-88l20-29z"
					/>
					<path fill="#78976a" d="m84 194 20-40 23 40zM372 168l19-43 24 43zM438 209l16-31 20 31z" />
					<path fill="#b5aa79" d="M326 278h41v12h-41zM343 263h39v13h-39zM358 247h38v13h-38z" />
					<path fill="#e2d5a7" d="M47 266h13v13H47zM149 245h12v12h-12zM403 260h12v12h-12zM476 239h12v12h-12z" />
				</svg>
			</div>
			<div className="absolute inset-x-[15px] bottom-[15px] z-[2] flex min-h-[59px] items-center gap-3 rounded-[5px] border border-[#ffffff91] bg-[#f4f3eada] px-3 py-2 backdrop-blur-[8px] max-phone:inset-x-[9px] max-phone:bottom-[9px]">
				<span className="grid h-[31px] w-[31px] place-items-center rounded bg-[#75865e] text-[17px] text-[#f0f1e5]">
					▧
				</span>
				<span>
					<b className="block font-sans text-[11px] font-bold">Our first base</b>
					<small className="mt-[3px] block text-[9px] text-[#777c70]">By Leo, Sarah and 4 others</small>
				</span>
				<span className="ml-auto grid h-[29px] w-[29px] place-items-center rounded-full bg-forest text-[9px] text-white">
					▶
				</span>
			</div>
			<div className="absolute top-1/2 right-[13px] -translate-y-1/4 rotate-[8deg] border border-[#6377517a] bg-[#eff1ded1] px-[11px] py-[9px] font-mono text-[8px] leading-[1.5] tracking-[0.7px] text-[#536b45] max-phone:right-[7px] max-phone:text-[6px]">
				MADE TOGETHER
				<br />
				<b className="text-[7px]">KEPT FOREVER</b>
			</div>
		</div>
	)
}
