import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type PointerFrame = {
  clientX: number
  clientY: number
  deltaX: number
  deltaY: number
  normalizedX: number
  normalizedY: number
  viewportWidth: number
  viewportHeight: number
  isActive: boolean
  isFine: boolean
  isPressed: boolean
  pressId: number
  idleFor: number
  time: number
}

type PointerFrameListener = (frame: PointerFrame) => void

type PointerTrackerValue = {
  clientX: MutableRefObject<number>
  clientY: MutableRefObject<number>
  isFinePointer: boolean
  subscribe: (listener: PointerFrameListener) => () => void
}

const PointerTrackerContext = createContext<PointerTrackerValue | null>(null)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function hasFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
}

export function PointerTrackerProvider({ children }: { children: ReactNode }) {
  const clientX = useRef(typeof window === 'undefined' ? 0 : window.innerWidth / 2)
  const clientY = useRef(typeof window === 'undefined' ? 0 : window.innerHeight / 2)
  const previousX = useRef(clientX.current)
  const previousY = useRef(clientY.current)
  const isActive = useRef(false)
  const isPressed = useRef(false)
  const pressId = useRef(0)
  const lastInputAt = useRef(0)
  const finePointerRef = useRef(hasFinePointer())
  const listeners = useRef(new Set<PointerFrameListener>())
  const [isFinePointer, setIsFinePointer] = useState(finePointerRef.current)

  const subscribe = useCallback((listener: PointerFrameListener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  useEffect(() => {
    const finePointerQuery = window.matchMedia('(pointer: fine)')

    const updatePointerMode = () => {
      finePointerRef.current = finePointerQuery.matches
      setIsFinePointer(finePointerQuery.matches)
    }

    const recordPointer = (event: PointerEvent) => {
      clientX.current = event.clientX
      clientY.current = event.clientY
      isActive.current = true
      lastInputAt.current = performance.now()
    }

    const handlePointerDown = (event: PointerEvent) => {
      recordPointer(event)
      isPressed.current = true
      pressId.current += 1
    }

    const handlePointerUp = (event: PointerEvent) => {
      recordPointer(event)
      isPressed.current = false
    }

    let animationFrame = 0

    const publishFrame = (time: number) => {
      const viewportWidth = Math.max(window.innerWidth, 1)
      const viewportHeight = Math.max(window.innerHeight, 1)
      const currentX = clientX.current
      const currentY = clientY.current

      const frame: PointerFrame = {
        clientX: currentX,
        clientY: currentY,
        deltaX: currentX - previousX.current,
        deltaY: currentY - previousY.current,
        normalizedX: clamp01(currentX / viewportWidth),
        normalizedY: clamp01(currentY / viewportHeight),
        viewportWidth,
        viewportHeight,
        isActive: isActive.current,
        isFine: finePointerRef.current,
        isPressed: isPressed.current,
        pressId: pressId.current,
        idleFor: isActive.current ? Math.max(0, time - lastInputAt.current) : 0,
        time,
      }

      previousX.current = currentX
      previousY.current = currentY
      listeners.current.forEach((listener) => listener(frame))
      animationFrame = window.requestAnimationFrame(publishFrame)
    }

    updatePointerMode()
    finePointerQuery.addEventListener('change', updatePointerMode)
    window.addEventListener('pointermove', recordPointer, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerup', handlePointerUp, { passive: true })
    window.addEventListener('pointercancel', handlePointerUp, { passive: true })
    animationFrame = window.requestAnimationFrame(publishFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      finePointerQuery.removeEventListener('change', updatePointerMode)
      window.removeEventListener('pointermove', recordPointer)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  const value = useMemo(
    () => ({ clientX, clientY, isFinePointer, subscribe }),
    [isFinePointer, subscribe],
  )

  return (
    <PointerTrackerContext.Provider value={value}>
      {children}
    </PointerTrackerContext.Provider>
  )
}

export function usePointerTracker() {
  const context = useContext(PointerTrackerContext)

  if (!context) {
    throw new Error('usePointerTracker must be used inside PointerTrackerProvider')
  }

  return context
}
