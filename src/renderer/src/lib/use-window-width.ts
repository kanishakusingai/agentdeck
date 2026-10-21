import { useEffect, useState } from 'react'

/** The window's width, kept up to date while it is resized. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
