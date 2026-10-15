// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import type { ViewerScene } from '../viewer-scene'
import { ViewerStudio } from './ViewerStudio'

afterEach(cleanup)
function mount(ready = true) {
	const scene = { setWeather: vi.fn(), setQuality: vi.fn(), setTour: vi.fn(), snapshot: vi.fn() }
	render(
		<I18nProvider initialLocale="en">
			<ViewerStudio sceneRef={{ current: scene as unknown as ViewerScene }} ready={ready} />
		</I18nProvider>
	)
	return scene
}

test('weather, quality and contemplation controls update the active scene', () => {
	const scene = mount()
	fireEvent.click(screen.getByRole('button', { name: /Mist/ }))
	expect(scene.setWeather).toHaveBeenCalledWith('mist')
	expect(screen.getByRole('button', { name: /Mist/ }).getAttribute('aria-pressed')).toBe('true')
	fireEvent.change(screen.getByRole('combobox'), { target: { value: 'eco' } })
	expect(scene.setQuality).toHaveBeenCalledWith('eco')
	fireEvent.click(screen.getByRole('button', { name: /Take a moment/ }))
	fireEvent.click(screen.getByRole('button', { name: /Take a moment/ }))
	expect(scene.setTour.mock.calls).toEqual([[true], [false]])
})

test('postcard requests a high resolution snapshot and downloads it locally', () => {
	const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
	const scene = mount()
	scene.snapshot.mockReturnValue('data:image/jpeg;base64,AA')
	fireEvent.click(screen.getByRole('button', { name: /Postcard/ }))
	expect(scene.snapshot).toHaveBeenCalledWith(1920, 1080)
	expect(click).toHaveBeenCalledTimes(1)
	expect(screen.getByRole('status').textContent).toContain('ready')
	click.mockRestore()
})

test('a loading viewer disables capture actions and does not offer public sharing for local files', () => {
	mount(false)
	expect((screen.getByRole('button', { name: /Postcard/ }) as HTMLButtonElement).disabled).toBe(true)
	expect(screen.queryByRole('button', { name: /Share/ })).toBeNull()
})
