// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
import { observeReveal, revealSelector } from './reveal'

function page() {
	document.body.innerHTML = `<div id="site"><section class="mc-section"><h2 class="mc-section__title">T</h2><p class="mc-section__text">x</p>
		<ol class="mc-steps"><li class="mc-step">1</li><li class="mc-step">2</li></ol></section><div class="mc-faq"><details class="mc-faq__item"></details></div></div>`
	return document.getElementById('site') as HTMLElement
}
function fakeObserver() {
	let callback: (entries: { isIntersecting: boolean; target: Element }[]) => void = () => undefined
	const observed: Element[] = []
	const unobserved: Element[] = []
	const disconnect = vi.fn()
	const factory = (cb: typeof callback) => {
		callback = cb
		return { observe: (t: Element) => observed.push(t), unobserve: (t: Element) => unobserved.push(t), disconnect }
	}
	return {
		factory,
		fire: (entries: { isIntersecting: boolean; target: Element }[]) => callback(entries),
		observed,
		unobserved,
		disconnect,
	}
}

test('blocks are hidden only once observed, enter once, are staggered, and everything is undone', () => {
	const root = page()
	const fake = fakeObserver()
	const stop = observeReveal(root, { reduced: false, createObserver: fake.factory, supported: true })
	expect(root.dataset.reveal).toBe('on')
	expect(fake.observed).toHaveLength(root.querySelectorAll(revealSelector).length)
	expect(fake.observed.length).toBe(5)
	const [title, text, step1, step2] = fake.observed as HTMLElement[]
	expect(title?.classList.contains('ds-reveal')).toBe(true)
	fake.fire([
		{ isIntersecting: true, target: title as Element },
		{ isIntersecting: false, target: text as Element },
		{ isIntersecting: true, target: step1 as Element },
		{ isIntersecting: true, target: step2 as Element },
	])
	expect(title?.classList.contains('is-in')).toBe(true)
	expect(text?.classList.contains('is-in')).toBe(false)
	expect([title, step1, step2].map(el => el?.style.getPropertyValue('--ds-i'))).toEqual(['0', '1', '2'])
	expect(fake.unobserved).toHaveLength(3)
	stop()
	expect(fake.disconnect).toHaveBeenCalled()
	expect(root.dataset.reveal).toBeUndefined()
	expect(root.querySelector('.ds-reveal')).toBeNull()
	expect(title?.style.getPropertyValue('--ds-i')).toBe('')
})

test('the stagger is capped and nothing is hidden when motion is reduced or the observer is missing', () => {
	const root = page()
	const fake = fakeObserver()
	observeReveal(root, { reduced: false, createObserver: fake.factory, supported: true })
	fake.fire(fake.observed.map(target => ({ isIntersecting: true, target })))
	expect((fake.observed[4] as HTMLElement).style.getPropertyValue('--ds-i')).toBe('4')
	const other = page()
	const spy = vi.fn()
	for (const options of [
		{ reduced: true, supported: true },
		{ reduced: false, supported: false },
	]) {
		const stop = observeReveal(other, { ...options, createObserver: spy as never })
		stop()
	}
	expect(spy).not.toHaveBeenCalled()
	expect(other.dataset.reveal).toBeUndefined()
})

test('the default observer is the browser IntersectionObserver', () => {
	const instances: unknown[] = []
	class Fake {
		constructor(
			public callback: unknown,
			public options: unknown
		) {
			instances.push(this)
		}
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal('IntersectionObserver', Fake)
	const stop = observeReveal(page(), { reduced: false })
	expect(instances).toHaveLength(1)
	stop()
	vi.unstubAllGlobals()
})
