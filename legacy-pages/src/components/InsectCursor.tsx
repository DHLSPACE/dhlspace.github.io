import { useEffect, useRef } from 'react'
import { usePointerTracker } from '../pointer/PointerTracker'

export function InsectCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const renderedX = useRef(0)
  const renderedY = useRef(0)
  const initialized = useRef(false)
  const { isFinePointer, subscribe } = usePointerTracker()

  useEffect(() => {
    if (!isFinePointer) return

    return subscribe((frame) => {
      const cursor = cursorRef.current
      if (!cursor) return

      if (!initialized.current) {
        renderedX.current = frame.clientX
        renderedY.current = frame.clientY
        initialized.current = frame.isActive
      }

      renderedX.current += (frame.clientX - renderedX.current) * 0.28
      renderedY.current += (frame.clientY - renderedY.current) * 0.28

      const rotation = Math.max(-22, Math.min(22, frame.deltaX * 1.8))
      const scale = frame.isPressed ? 0.76 : 1
      cursor.style.opacity = frame.isActive ? '1' : '0'
      cursor.style.transform = `translate3d(${renderedX.current}px, ${renderedY.current}px, 0) translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`
    })
  }, [isFinePointer, subscribe])

  if (!isFinePointer) return null

  return (
    <div ref={cursorRef} className="insect-cursor" aria-hidden="true">
      <svg viewBox="0 0 34 28" role="presentation">
        <path d="M16 13C10 4 3 4 2 10c-1 6 7 7 14 4Z" fill="rgba(255,255,255,.82)" stroke="currentColor" />
        <path d="M18 13c6-9 13-9 14-3 1 6-7 7-14 4Z" fill="rgba(255,255,255,.82)" stroke="currentColor" />
        <ellipse cx="17" cy="16" rx="4.5" ry="8" fill="currentColor" />
        <circle cx="17" cy="7" r="3.2" fill="currentColor" />
        <path d="m15 5-3-3m7 3 3-3M13 16 7 14m14 2 6-2m-14 6-6 3m14-3 6 3" fill="none" stroke="currentColor" strokeLinecap="round" />
      </svg>
    </div>
  )
}
