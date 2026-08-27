import { useEffect, useRef } from 'react'
import { usePointerTracker, type PointerFrame } from '../pointer/PointerTracker'

const IMAGE_ROOT = '/chameleon-angles'
const CENTER_POSE = `${IMAGE_ROOT}/yaw-center.webp`
const YAW_POSES = [
  `${IMAGE_ROOT}/yaw-left-90.webp`,
  `${IMAGE_ROOT}/yaw-left-60.webp`,
  `${IMAGE_ROOT}/yaw-left-45.webp`,
  `${IMAGE_ROOT}/yaw-left-30.webp`,
  `${IMAGE_ROOT}/yaw-left-15.webp`,
  CENTER_POSE,
  `${IMAGE_ROOT}/yaw-right-15.webp`,
  `${IMAGE_ROOT}/yaw-right-30.webp`,
  `${IMAGE_ROOT}/yaw-right-45.webp`,
  `${IMAGE_ROOT}/yaw-right-60.webp`,
  `${IMAGE_ROOT}/yaw-right-90.webp`,
]

const PITCH_UP_POSE = `${IMAGE_ROOT}/pitch-up-10.webp`
const PITCH_DOWN_POSE = `${IMAGE_ROOT}/pitch-down-20.webp`
const TILT_LEFT_POSE = `${IMAGE_ROOT}/tilt-left-curious.webp`
const TILT_RIGHT_POSE = `${IMAGE_ROOT}/tilt-right.webp`
const CROSSFADE_MS = 180

function horizontalPose(normalizedX: number) {
  const index = Math.round(normalizedX * (YAW_POSES.length - 1))
  return YAW_POSES[Math.min(YAW_POSES.length - 1, Math.max(0, index))]
}

function idlePose(time: number) {
  const poses = [CENTER_POSE, TILT_LEFT_POSE, CENTER_POSE, TILT_RIGHT_POSE]
  return poses[Math.floor(time / 1500) % poses.length]
}

function poseForFrame(
  frame: PointerFrame,
  smoothedX: number,
  smoothedY: number,
  gesturePose: string | null,
  gestureEndsAt: number,
) {
  if (gesturePose && frame.time < gestureEndsAt) return gesturePose
  if (frame.idleFor > 5000) return idlePose(frame.time)
  if (smoothedY < 0.28) return PITCH_UP_POSE
  if (smoothedY > 0.72) return PITCH_DOWN_POSE
  return horizontalPose(smoothedX)
}

export function ChameleonSequence() {
  const imageRefs = [useRef<HTMLImageElement>(null), useRef<HTMLImageElement>(null)]
  const activeLayer = useRef(0)
  const currentSource = useRef(CENTER_POSE)
  const wantedSource = useRef(CENTER_POSE)
  const loading = useRef(false)
  const transitionTimer = useRef<number | null>(null)
  const smoothedX = useRef(0.5)
  const smoothedY = useRef(0.5)
  const lastPressId = useRef(0)
  const gesturePose = useRef<string | null>(null)
  const gestureEndsAt = useRef(0)
  const { subscribe } = usePointerTracker()

  useEffect(() => {
    let mounted = true

    const showWantedPose = () => {
      if (!mounted || loading.current || wantedSource.current === currentSource.current) return

      const hiddenLayer = activeLayer.current === 0 ? 1 : 0
      const nextImage = imageRefs[hiddenLayer].current
      const previousImage = imageRefs[activeLayer.current].current
      if (!nextImage || !previousImage) return

      loading.current = true
      const requestedSource = wantedSource.current

      nextImage.onload = () => {
        if (!mounted) return

        if (requestedSource !== wantedSource.current) {
          loading.current = false
          showWantedPose()
          return
        }

        nextImage.style.opacity = '1'
        previousImage.style.opacity = '0'
        activeLayer.current = hiddenLayer
        currentSource.current = requestedSource
        loading.current = false

        transitionTimer.current = window.setTimeout(() => {
          transitionTimer.current = null
          showWantedPose()
        }, CROSSFADE_MS)
      }

      nextImage.onerror = () => {
        loading.current = false
      }

      nextImage.src = requestedSource
    }

    const unsubscribe = subscribe((frame) => {
      smoothedX.current += (frame.normalizedX - smoothedX.current) * 0.14
      smoothedY.current += (frame.normalizedY - smoothedY.current) * 0.14

      if (frame.pressId !== lastPressId.current) {
        lastPressId.current = frame.pressId
        gesturePose.current = frame.normalizedX < 0.5 ? TILT_LEFT_POSE : TILT_RIGHT_POSE
        gestureEndsAt.current = frame.time + 720
      }

      const nextPose = poseForFrame(
        frame,
        smoothedX.current,
        smoothedY.current,
        gesturePose.current,
        gestureEndsAt.current,
      )

      if (nextPose !== wantedSource.current) {
        wantedSource.current = nextPose
        if (transitionTimer.current === null) showWantedPose()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current)
    }
  }, [subscribe])

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#f89b28]" aria-hidden="true">
      <img
        ref={imageRefs[0]}
        src={CENTER_POSE}
        alt=""
        draggable="false"
        className="chameleon-sequence-image opacity-100"
      />
      <img
        ref={imageRefs[1]}
        src={CENTER_POSE}
        alt=""
        draggable="false"
        className="chameleon-sequence-image opacity-0"
      />
    </div>
  )
}
