import { useEffect, useState } from 'react'

const animationStorageKey = (pageKey) => `playlink-page-entry-seen:${pageKey}`
const activeAnimations = new Set()

function shouldAnimate(pageKey) {
  const key = animationStorageKey(pageKey)
  if (activeAnimations.has(key)) return true
  try {
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
    activeAnimations.add(key)
    return true
  } catch {
    return false
  }
}

export default function PageEntryAnimation({ pageKey, children }) {
  const [isEntering, setIsEntering] = useState(() => shouldAnimate(pageKey))

  useEffect(() => {
    if (!isEntering) return undefined
    const key = animationStorageKey(pageKey)
    activeAnimations.add(key)
    const timeout = window.setTimeout(() => {
      activeAnimations.delete(key)
      setIsEntering(false)
    }, 3000)
    return () => {
      window.clearTimeout(timeout)
      activeAnimations.delete(key)
    }
  }, [isEntering, pageKey])

  return <div className={`page-entry-animation${isEntering ? ' is-entering' : ''}`} data-page-entry={pageKey}>{children}</div>
}
