import { describe, expect, it } from 'vitest'
import { addBrowser, browserLabel, clampSidebarWidth, closeBrowser, DEFAULT_BROWSERS, MAIN_BROWSER, maxSidebarWidth, MIN_CANVAS, RAIL_WIDTH, shownAfterClose, SIDEBAR_WIDTH, withUrl } from './sidebar'

describe('sidebar browser tabs', () => {
  it('numbers new tabs and keeps the numbers when one is closed', () => {
    let list = addBrowser(addBrowser(DEFAULT_BROWSERS, 'a'), 'b')
    expect(list.map(browserLabel)).toEqual(['Browser', 'Browser 2', 'Browser 3'])
    list = closeBrowser(list, 'a')
    expect(list.map(browserLabel)).toEqual(['Browser', 'Browser 3'])
    expect(addBrowser(list, 'c').map(browserLabel)).toEqual(['Browser', 'Browser 3', 'Browser 4'])
  })

  it('never closes the main tab', () => {
    expect(closeBrowser(DEFAULT_BROWSERS, MAIN_BROWSER)).toEqual(DEFAULT_BROWSERS)
  })

  it('shows the left neighbour after closing the tab on screen', () => {
    const list = addBrowser(addBrowser(DEFAULT_BROWSERS, 'a'), 'b')
    expect(shownAfterClose(list, 'b', 'b')).toBe('a')
    expect(shownAfterClose(list, 'a', 'a')).toBe(MAIN_BROWSER)
    expect(shownAfterClose(list, 'a', 'b')).toBe('a')
  })

  it('remembers each tab’s address', () => {
    const list = withUrl(addBrowser(DEFAULT_BROWSERS, 'a'), 'a', 'https://example.com/')
    expect(list[1].url).toBe('https://example.com/')
    expect(list[0].url).toBeUndefined()
  })
})

describe('sidebar width', () => {
  it('leaves room for the panes and the left rail', () => {
    expect(maxSidebarWidth(1800, false)).toBe(1800 - 24 - MIN_CANVAS)
    expect(maxSidebarWidth(1800, true)).toBe(1800 - 24 - RAIL_WIDTH - 8 - MIN_CANVAS)
  })

  it('never goes below the minimum, even in a tiny window', () => {
    expect(maxSidebarWidth(600, true)).toBe(SIDEBAR_WIDTH.min)
    expect(clampSidebarWidth(100, 900)).toBe(SIDEBAR_WIDTH.min)
    expect(clampSidebarWidth(2000, 900)).toBe(900)
    expect(clampSidebarWidth(512.6, 900)).toBe(513)
  })
})
