import { useEffect, useRef } from 'react'
import { usePointerTracker } from '../pointer/PointerTracker'

const SENSITIVITY = 0.8

export function usePointerScrubVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const targetTimeRef = useRef(0)
  const seekInProgressRef = useRef(false)
  const hasReceivedFirstPointerFrame = useRef(false)
  const { subscribe } = usePointerTracker()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const requestSeek = () => {
      if (
        seekInProgressRef.current ||
        !Number.isFinite(video.duration) ||
        Math.abs(video.currentTime - targetTimeRef.current) < 0.001
      ) {
        return
      }

      seekInProgressRef.current = true
      video.currentTime = targetTimeRef.current
    }

    const unsubscribe = subscribe((frame) => {
      if (!frame.isFine || !frame.isActive || !Number.isFinite(video.duration)) return

      if (!hasReceivedFirstPointerFrame.current) {
        hasReceivedFirstPointerFrame.current = true
        return
      }

      if (frame.deltaX === 0) return

      const timeOffset = (frame.deltaX / frame.viewportWidth) * SENSITIVITY * video.duration
      targetTimeRef.current = Math.min(
        video.duration,
        Math.max(0, targetTimeRef.current + timeOffset),
      )
      requestSeek()
    })

    const handleSeeked = () => {
      seekInProgressRef.current = false
      requestSeek()
    }

    const handleLoadedMetadata = () => {
      targetTimeRef.current = Math.min(video.currentTime, video.duration)
    }

    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      unsubscribe()
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [subscribe])

  return videoRef
}
