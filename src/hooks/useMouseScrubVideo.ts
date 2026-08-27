import { useEffect, useRef } from 'react'

const SENSITIVITY = 0.8

export function useMouseScrubVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previousXRef = useRef<number | null>(null)
  const targetTimeRef = useRef(0)
  const seekInProgressRef = useRef(false)

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

    const handleMouseMove = (event: MouseEvent) => {
      const previousX = previousXRef.current
      previousXRef.current = event.clientX

      if (previousX === null || !Number.isFinite(video.duration)) return

      const delta = event.clientX - previousX
      const timeOffset = (delta / window.innerWidth) * SENSITIVITY * video.duration
      targetTimeRef.current = Math.min(
        video.duration,
        Math.max(0, targetTimeRef.current + timeOffset),
      )
      requestSeek()
    }

    const handleSeeked = () => {
      seekInProgressRef.current = false
      requestSeek()
    }

    const handleLoadedMetadata = () => {
      targetTimeRef.current = Math.min(video.currentTime, video.duration)
    }

    window.addEventListener('mousemove', handleMouseMove)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [])

  return videoRef
}
